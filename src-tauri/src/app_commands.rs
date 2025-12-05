use crate::db::{Database, TabState};
use chrono::{DateTime, Local};
use std::fs;
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::State;

pub struct AppState {
    pub db: Mutex<Database>,
}

#[derive(serde::Serialize)]
pub struct FileMetadata {
    pub created: Option<String>,
    pub modified: Option<String>,
}

fn format_system_time(time: std::io::Result<SystemTime>) -> Option<String> {
    time.ok().map(|t| {
        let datetime: DateTime<Local> = t.into();
        datetime.format("%Y%m%d / %H%M%S").to_string()
    })
}

fn validate_path(path: &str) -> Result<(), String> {
    // Check for null bytes
    if path.contains('\0') {
        return Err("Invalid path: contains null bytes".to_string());
    }

    // Check for suspicious path patterns
    if path.contains("..") {
        return Err("Invalid path: contains parent directory references".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn save_session(state: State<'_, AppState>, tabs: Vec<TabState>) -> Result<(), String> {
    let mut db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock db".to_string())?;
    db.save_session(&tabs).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> Result<Vec<TabState>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock db".to_string())?;
    db.load_session().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    validate_path(&path)?;

    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024; // 50MB

    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large: {} MB (max {} MB)",
            metadata.len() / 1024 / 1024,
            MAX_FILE_SIZE / 1024 / 1024
        ));
    }

    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;

    // Write to temp file first, then rename
    let temp_path = format!("{}.tmp", path);
    fs::write(&temp_path, &content).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, &path).map_err(|e| {
        // Clean up temp file on error
        let _ = fs::remove_file(&temp_path);
        e.to_string()
    })
}

#[tauri::command]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    validate_path(&path)?;

    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;

    Ok(FileMetadata {
        created: format_system_time(metadata.created()),
        modified: format_system_time(metadata.modified()),
    })
}

#[derive(serde::Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub install_path: String,
    pub data_path: String,
}

#[tauri::command]
pub async fn get_app_info(app_handle: tauri::AppHandle) -> Result<AppInfo, String> {
    let install_path = std::env::current_exe()
        .map(|p| p.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default())
        .unwrap_or_default();

    let data_path = app_handle
        .path()
        .data_dir()
        .map(|p| p.join("MarkdownRS").to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(AppInfo {
        name: "MarkdownRS".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        install_path,
        data_path,
    })
}

#[tauri::command]
pub async fn send_to_recycle_bin(path: String) -> Result<(), String> {
    validate_path(&path)?;

    // Use trash crate for cross-platform recycle bin support
    trash::delete(&path).map_err(|e| format!("Failed to send file to recycle bin: {}", e))
}
