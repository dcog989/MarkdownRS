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
        datetime.format("%Y-%m-%d %H:%M").to_string()
    })
}

#[tauri::command]
pub async fn save_session(state: State<'_, AppState>, tabs: Vec<TabState>) -> Result<(), String> {
    let db = state
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
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;

    Ok(FileMetadata {
        created: format_system_time(metadata.created()),
        modified: format_system_time(metadata.modified()),
    })
}
