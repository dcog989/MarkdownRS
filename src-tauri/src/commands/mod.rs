use crate::db::{Database, TabState};
use std::fs;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub db: Mutex<Database>,
}

#[tauri::command]
pub async fn save_session(state: State<'_, AppState>, tabs: Vec<TabState>) -> Result<(), String> {
    // Acquire lock, handle potential poisoning
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
