use anyhow::Result;
use chrono::{DateTime, Local};
use encoding_rs::{UTF_16BE, UTF_16LE};
use std::path::{Component, Path};
use std::time::SystemTime;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use unicode_bom::Bom;

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

/// Reads text file with automatic BOM (Byte Order Mark) detection and stripping.
/// Handles UTF-8, UTF-16LE, and UTF-16BE encoded files.
/// Takes ownership of the byte buffer to allow zero-copy conversion for
/// valid UTF-8 (the common case via `String::from_utf8`).
pub fn read_text_with_bom_detection(raw_bytes: Vec<u8>) -> String {
    match Bom::from(&raw_bytes[..]) {
        Bom::Null => {
            // Zero-copy for valid UTF-8 (the 99% case).
            String::from_utf8(raw_bytes)
                .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
        },
        Bom::Utf8 => String::from_utf8_lossy(&raw_bytes[3..]).to_string(),
        Bom::Utf16Le => {
            let (decoded, _, had_errors) = UTF_16LE.decode(&raw_bytes[2..]);
            if had_errors {
                log::warn!("UTF-16LE decoding encountered errors");
            }
            decoded.to_string()
        },
        Bom::Utf16Be => {
            let (decoded, _, had_errors) = UTF_16BE.decode(&raw_bytes[2..]);
            if had_errors {
                log::warn!("UTF-16BE decoding encountered errors");
            }
            decoded.to_string()
        },
        bom => {
            log::warn!("Exotic BOM type {:?} detected, falling back to UTF-8", bom);
            String::from_utf8_lossy(&raw_bytes[bom.len()..]).to_string()
        },
    }
}
