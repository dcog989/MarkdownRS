use crate::utils::{format_system_time, validate_path};
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

/// Standardized error handler for file operations
fn handle_file_error(path: &str, operation: &str, e: impl std::fmt::Display) -> String {
    log::error!("Failed to {} '{}': {}", operation, path, e);
    format!("Failed to {}: {}", operation, e)
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<FileContent, String> {
    let start = std::time::Instant::now();
    
    validate_path(&path)?;
    let metadata = fs::metadata(&path)
        .await
        .map_err(|e| handle_file_error(&path, "read metadata", e))?;

    if metadata.is_dir() {
        log::warn!("Attempted to read directory as file: {}", path);
        return Err("Cannot read a directory as a text file".to_string());
    }

    const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;
    if metadata.len() > MAX_FILE_SIZE {
        log::warn!(
            "File too large to read: {} ({} MB)",
            path,
            metadata.len() / 1024 / 1024
        );
        return Err(format!(
            "File too large: {} MB (max {} MB)",
            metadata.len() / 1024 / 1024,
            MAX_FILE_SIZE / 1024 / 1024
        ));
    }

    let bytes = fs::read(&path)
        .await
        .map_err(|e| handle_file_error(&path, "read file", e))?;

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
        .map_err(|e| {
            log::error!("Failed to save file '{}': {}", path, e);
            format!("Failed to save file: {}", e)
        })?;

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
    let metadata = fs::metadata(&path).await.map_err(|e| {
        log::debug!("Failed to get metadata for '{}': {}", path, e);
        format!("Failed to get file metadata: {}", e)
    })?;
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
        trash::delete(&path).map_err(|e| handle_file_error(&path, "send to recycle bin", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn resolve_path_relative(
    base_path: Option<String>,
    click_path: String,
) -> Result<String, String> {
    let path_buf = if let Some(base) = base_path {
        let mut p = PathBuf::from(base);
        p.pop();
        p.push(click_path);
        p
    } else {
        PathBuf::from(click_path)
    };

    let cleaned = path_buf.clean();

    // Async exists check using metadata
    if fs::metadata(&cleaned).await.is_err() {
        log::debug!("Resolved path does not exist: {:?}", cleaned);
        return Err("File does not exist".to_string());
    }

    cleaned
        .canonicalize()
        .map(|p| {
            log::debug!("Resolved path: {:?}", p);
            p.to_string_lossy().to_string()
        })
        .map_err(|e| {
            let path_str = cleaned.to_string_lossy();
            handle_file_error(&path_str, "canonicalize path", e)
        })
}

#[tauri::command]
pub async fn write_binary_file(path: String, content: Vec<u8>) -> Result<(), String> {
    validate_path(&path)?;
    let path_buf = PathBuf::from(&path);

    crate::utils::atomic_write(&path_buf, &content)
        .await
        .map_err(|e| handle_file_error(&path, "write binary file", e))?;

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

    fs::rename(&old_path, &new_path).await.map_err(|e| {
        log::error!(
            "Failed to rename file from '{}' to '{}': {}",
            old_path,
            new_path,
            e
        );
        format!("Failed to rename file: {}", e)
    })
}
