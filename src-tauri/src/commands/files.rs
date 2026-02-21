use crate::commands::settings::get_max_file_size_bytes;
use crate::utils::{format_system_time, handle_error, validate_path};
use encoding_rs::{Encoding, UTF_8};
use path_clean::PathClean;
use serde::Serialize;
use std::path::PathBuf;
use tokio::fs;

#[derive(Serialize)]
pub struct FileMetadata {
    pub created: Option<String>,
    pub modified: Option<String>,
    pub size: u64,
}

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
    pub encoding: String,
}

#[tauri::command]
pub async fn read_text_file(
    path: String,
    app_handle: tauri::AppHandle,
) -> Result<FileContent, String> {
    let start = std::time::Instant::now();

    validate_path(&path)?;
    let metadata = fs::metadata(&path)
        .await
        .map_err(|e| handle_error(Some(&path), "read metadata", e))?;

    if metadata.is_dir() {
        log::warn!("Attempted to read directory as file: {}", path);
        return Err("Cannot read a directory as a text file".to_string());
    }

    let max_file_size = get_max_file_size_bytes(&app_handle).await;

    if metadata.len() > max_file_size {
        log::warn!(
            "File too large to read: {} ({} MB)",
            path,
            metadata.len() / 1024 / 1024
        );
        return Err(format!(
            "File too large: {} MB (max {} MB)",
            metadata.len() / 1024 / 1024,
            max_file_size / 1024 / 1024
        ));
    }

    let bytes = fs::read(&path)
        .await
        .map_err(|e| handle_error(Some(&path), "read file", e))?;

    if let Some((encoding, _)) = Encoding::for_bom(&bytes) {
        let (cow, _) = encoding.decode_with_bom_removal(&bytes);
        return Ok(FileContent {
            content: cow.into_owned(),
            encoding: encoding.name().to_string(),
        });
    }

    let (cow, _, had_errors) = UTF_8.decode(&bytes);
    if !had_errors {
        return Ok(FileContent {
            content: cow.into_owned(),
            encoding: "UTF-8".to_string(),
        });
    }

    // Fallback detection (CPU bound, fine to run here or could use spawn_blocking if huge)
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(&bytes, true);
    let detected_encoding = detector.guess(None, false);
    let (cow, _, _) = detected_encoding.decode(&bytes);

    let result = FileContent {
        content: cow.into_owned(),
        encoding: detected_encoding.name().to_string(),
    };

    let duration = start.elapsed();
    log::info!(
        "[Storage] read_text_file | duration={:?} | size={} bytes | path={}",
        duration,
        result.content.len(),
        path
    );

    Ok(result)
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    let start = std::time::Instant::now();
    let content_size = content.len();

    validate_path(&path)?;
    let path_buf = PathBuf::from(&path);

    crate::utils::atomic_write(&path_buf, content.as_bytes())
        .await
        .map_err(|e| handle_error(Some(&path), "save file", e))?;

    let duration = start.elapsed();
    log::info!(
        "[Storage] write_text_file | duration={:?} | size={} bytes | path={}",
        duration,
        content_size,
        path
    );

    Ok(())
}

#[tauri::command]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    validate_path(&path)?;
    let metadata = fs::metadata(&path)
        .await
        .map_err(|e| handle_error(Some(&path), "get metadata", e))?;
    Ok(FileMetadata {
        created: format_system_time(metadata.created()),
        modified: format_system_time(metadata.modified()),
        size: metadata.len(),
    })
}

#[tauri::command]
pub async fn send_to_recycle_bin(path: String) -> Result<(), String> {
    validate_path(&path)?;
    // trash crate is blocking, so we wrap it in spawn_blocking to prevent UI freezes
    tokio::task::spawn_blocking(move || {
        trash::delete(&path).map_err(|e| handle_error(Some(&path), "send to recycle bin", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn resolve_path_relative(
    base_path: Option<String>,
    click_path: String,
) -> Result<String, String> {
    // Security check: Validate input path BEFORE processing to prevent traversal
    // Reject paths with more than 3 parent directory references
    let parent_dir_count =
        click_path.matches("../").count() + if click_path.ends_with("/..") { 1 } else { 0 };
    if parent_dir_count > 3 {
        log::warn!(
            "Path traversal blocked: excessive parent directory references in input: {}",
            click_path
        );
        return Err("Access denied: invalid path".to_string());
    }

    // Get the base directory for path traversal protection
    let base_dir = base_path
        .as_ref()
        .and_then(|base| PathBuf::from(base).parent().map(|p| p.to_path_buf()));

    let path_buf = if let Some(base) = base_path {
        let mut p = PathBuf::from(base);
        p.pop();
        p.push(click_path);
        p
    } else {
        PathBuf::from(click_path)
    };

    let cleaned = path_buf.clean();

    // Canonicalize the path to resolve any symlinks and get absolute path
    let canonicalized = dunce::canonicalize(&cleaned).map_err(|e| {
        let path_str = cleaned.to_string_lossy();
        handle_error(Some(&path_str), "canonicalize path", e)
    })?;

    // Security check: Ensure the resolved path is within the base directory
    // This prevents path traversal attacks like "../../../../etc/passwd"
    if let Some(ref base) = base_dir {
        let canonical_base = dunce::canonicalize(base).map_err(|e| {
            let base_str = base.to_string_lossy();
            handle_error(Some(&base_str), "canonicalize base path", e)
        })?;

        if !canonicalized.starts_with(&canonical_base) {
            log::warn!(
                "Path traversal blocked: resolved path {:?} is outside base directory {:?}",
                canonicalized,
                canonical_base
            );
            return Err("Access denied: path escapes base directory".to_string());
        }
    }

    log::debug!("Resolved path: {:?}", canonicalized);
    Ok(canonicalized.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn write_binary_file(path: String, content: Vec<u8>) -> Result<(), String> {
    validate_path(&path)?;
    let path_buf = PathBuf::from(&path);

    crate::utils::atomic_write(&path_buf, &content)
        .await
        .map_err(|e| handle_error(Some(&path), "write binary file", e))?;

    log::debug!("Successfully wrote binary file: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    validate_path(&old_path)?;
    validate_path(&new_path)?;

    if fs::metadata(&old_path).await.is_err() {
        log::warn!("Attempted to rename non-existent file: {}", old_path);
        return Err("Source file does not exist".to_string());
    }

    if fs::metadata(&new_path).await.is_ok() {
        log::warn!("Attempted to rename to existing file: {}", new_path);
        return Err("A file with that name already exists".to_string());
    }

    fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| handle_error(Some(&old_path), "rename file", e))
}

#[tauri::command]
pub async fn add_to_recent_files(
    state: tauri::State<'_, crate::state::AppState>,
    path: String,
    last_opened: String,
) -> Result<(), String> {
    state
        .db
        .add_recent_file(&path, &last_opened)
        .map_err(|e| handle_error(Some(&path), "add to recent files", e))
}

#[tauri::command]
pub async fn get_recent_files(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<Vec<String>, String> {
    state
        .db
        .get_recent_files()
        .map_err(|e| handle_error(None, "get recent files", e))
}

#[tauri::command]
pub async fn remove_from_recent_files(
    state: tauri::State<'_, crate::state::AppState>,
    path: String,
) -> Result<(), String> {
    state
        .db
        .remove_recent_file(&path)
        .map_err(|e| handle_error(Some(&path), "remove recent file", e))
}

#[tauri::command]
pub async fn clear_recent_files(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<(), String> {
    state
        .db
        .clear_recent_files()
        .map_err(|e| handle_error(None, "clear recent files", e))
}
