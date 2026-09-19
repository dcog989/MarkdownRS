use crate::utils::{format_system_time, handle_error, run_blocking, validate_path};
use serde::Serialize;
use tokio::fs;

#[derive(Serialize)]
pub struct FileMetadata {
    pub created: Option<String>,
    pub modified: Option<String>,
    pub size: u64,
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
    run_blocking("send to recycle bin", move || {
        trash::delete(&path).map_err(|e| handle_error(Some(&path), "send to recycle bin", e))
    })
    .await
}
