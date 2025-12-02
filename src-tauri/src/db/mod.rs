use crate::db::{Database, TabState};
use log::{error, info};
use std::fs;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub db: Mutex<Database>,
}

#[tauri::command]
pub async fn save_session(state: State<'_, AppState>, tabs: Vec<TabState>) -> Result<(), String> {
    info!("Saving session with {} tabs", tabs.len());
    let db = state.db.lock().map_err(|_| {
        error!("Failed to lock db for saving");
        "Failed to lock db"
    })?;
    db.save_session(&tabs).map_err(|e| {
        error!("Database save error: {}", e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> Result<Vec<TabState>, String> {
    info!("Restoring session");
    let db = state.db.lock().map_err(|_| {
        error!("Failed to lock db for restoration");
        "Failed to lock db"
    })?;
    db.load_session().map_err(|e| {
        error!("Database load error: {}", e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    info!("Reading file: {}", path);
    fs::read_to_string(&path).map_err(|e| {
        error!("Failed to read file {}: {}", path, e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    info!("Writing file: {}", path);
    fs::write(&path, content).map_err(|e| {
        error!("Failed to write file {}: {}", path, e);
        e.to_string()
    })
}
