use anyhow::Result;
use chrono::{DateTime, Local};
use encoding_rs::{Encoding, UTF_8};
use std::path::{Component, Path};
use std::time::SystemTime;
use tokio::fs;
use tokio::io::AsyncWriteExt;

/// Trait to convert anyhow errors to String for Tauri IPC compatibility
pub trait IntoTauriError<T> {
    fn to_tauri_result(self) -> Result<T, String>;
}

impl<T> IntoTauriError<T> for anyhow::Result<T> {
    fn to_tauri_result(self) -> Result<T, String> {
        self.map_err(|e| {
            log::error!("{}", e);
            e.to_string()
        })
    }
}

/// Standardized error handler for all operations
pub fn handle_error(context: Option<&str>, operation: &str, e: impl std::fmt::Display) -> String {
    let msg = match context {
        Some(c) => format!("Failed to {} '{}': {}", operation, c, e),
        None => format!("Failed to {}: {}", operation, e),
    };
    log::error!("{}", msg);
    msg
}

pub fn format_system_time(time: std::io::Result<SystemTime>) -> Option<String> {
    time.ok().map(|t| {
        let datetime: DateTime<Local> = t.into();
        datetime.format("%Y%m%d / %H%M%S").to_string()
    })
}

pub fn validate_path(path: &str) -> Result<(), String> {
    if path.contains('\0') {
        return Err("Invalid path: contains null bytes".to_string());
    }

    // Block percent-encoded traversal sequences before any further processing.
    if path.contains("..%2e") || path.contains("%2e%2e") || path.contains("%252e") {
        return Err("Invalid path: contains encoded directory traversal".to_string());
    }

    // Count real parent-directory components using the stdlib path parser so
    // that filenames like `docs/foo../bar.txt` are not falsely rejected.
    let parent_components = Path::new(path)
        .components()
        .filter(|c| *c == Component::ParentDir)
        .count();
    if parent_components > 3 {
        return Err("Invalid path: excessive directory traversal".to_string());
    }

    if let Some(stem) = Path::new(path).file_stem().and_then(|s| s.to_str()) {
        let stem_upper = stem.to_uppercase();
        let reserved = [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ];
        if reserved.contains(&stem_upper.as_str()) {
            return Err(format!("Invalid path: '{}' is a reserved name", stem));
        }
    }
    Ok(())
}

/// atomic_write writes content to a temporary file and then renames it to the target path.
/// This ensures that the target file is not corrupted if the write fails or is interrupted.
pub async fn atomic_write(path: &Path, content: &[u8]) -> std::io::Result<()> {
    // Append .tmp to the filename to avoid extension replacement collision
    let file_name = path
        .file_name()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid path"))?
        .to_string_lossy();
    let temp_path = path.with_file_name(format!("{}.{}.tmp", file_name, uuid::Uuid::new_v4()));

    {
        let mut file = tokio::fs::File::create(&temp_path).await?;
        file.write_all(content).await?;
        file.sync_all().await?;
    }

    match fs::rename(&temp_path, path).await {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            // Cross-device: copy then clean up the temp file.
            fs::copy(&temp_path, path).await.inspect_err(|_| {
                let _ = std::fs::remove_file(&temp_path);
            })?;
            if let Err(rm_err) = fs::remove_file(&temp_path).await {
                // The data reached the destination successfully; log the leak
                // but still return Ok so the caller isn't misled into thinking
                // the write itself failed.
                log::warn!(
                    "atomic_write: temp file {:?} could not be removed after cross-device copy: {}",
                    temp_path,
                    rm_err
                );
            }
            Ok(())
        },
        Err(e) => {
            let _ = fs::remove_file(&temp_path).await;
            Err(e)
        },
    }
}

/// Cleans up stale temporary files (.tmp) older than the specified duration.
/// Used to recover from crashes during atomic_write operations.
pub async fn cleanup_stale_temp_files(
    dir: &Path,
    max_age: std::time::Duration,
) -> std::io::Result<()> {
    let mut entries = fs::read_dir(dir).await?;
    let now = std::time::SystemTime::now();

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("tmp") {
            continue;
        }

        let Ok(metadata) = entry.metadata().await else {
            continue;
        };

        let Ok(modified) = metadata.modified() else {
            continue;
        };

        let Ok(age) = now.duration_since(modified) else {
            continue;
        };

        if age > max_age {
            if let Err(e) = fs::remove_file(&path).await {
                log::warn!("Failed to remove stale temp file {:?}: {}", path, e);
            } else {
                log::info!("Cleaned up stale temp file: {:?}", path);
            }
        }
    }
    Ok(())
}

/// Extension trait for poison-safe `Mutex` access.
pub trait MutexExt<T> {
    fn lock_or_recover(&self) -> std::sync::MutexGuard<'_, T>;
}

impl<T> MutexExt<T> for std::sync::Mutex<T> {
    fn lock_or_recover(&self) -> std::sync::MutexGuard<'_, T> {
        self.lock().unwrap_or_else(|e| {
            log::warn!("Mutex poisoned, continuing with potentially corrupt state");
            e.into_inner()
        })
    }
}

/// Runs a blocking closure on the tokio blocking thread-pool,
/// returning Err with the task name on a join panic.
pub async fn run_blocking<F, T>(task_label: &'static str, f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| format!("{} task failed: {}", task_label, e))?
}

/// Decodes bytes to (content, encoding_name) using BOM detection,
/// UTF-8 fallback, and chardetng as a last resort.
pub fn decode_text(raw_bytes: Vec<u8>) -> (String, String) {
    if let Some((encoding, _)) = Encoding::for_bom(&raw_bytes) {
        let (cow, _) = encoding.decode_with_bom_removal(&raw_bytes);
        return (cow.into_owned(), encoding.name().to_string());
    }

    let (cow, _, had_errors) = UTF_8.decode(&raw_bytes);
    if !had_errors {
        return (cow.into_owned(), "UTF-8".to_string());
    }

    let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Deny);
    detector.feed(&raw_bytes, true);
    let detected = detector.guess(None, chardetng::Utf8Detection::Deny);
    let (cow, _, _) = detected.decode(&raw_bytes);
    (cow.into_owned(), detected.name().to_string())
}

/// Convenience wrapper that returns only the decoded text.
pub fn read_text_with_bom_detection(raw_bytes: Vec<u8>) -> String {
    decode_text(raw_bytes).0
}
