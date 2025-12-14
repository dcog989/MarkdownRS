use crate::db::{Database, TabState};
use chrono::{DateTime, Local};
use encoding_rs::{Encoding, UTF_8, WINDOWS_1252};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::{Manager, State};

pub struct AppState {
    pub db: Mutex<Database>,
}

#[derive(serde::Serialize)]
pub struct FileMetadata {
    pub created: Option<String>,
    pub modified: Option<String>,
}

#[derive(serde::Serialize)]
pub struct FileContent {
    pub content: String,
    pub encoding: String,
}

fn format_system_time(time: std::io::Result<SystemTime>) -> Option<String> {
    time.ok().map(|t| {
        let datetime: DateTime<Local> = t.into();
        datetime.format("%Y%m%d / %H%M%S").to_string()
    })
}

fn validate_path(path: &str) -> Result<(), String> {
    if path.contains('\0') {
        return Err("Invalid path: contains null bytes".to_string());
    }
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
pub async fn read_text_file(path: String) -> Result<FileContent, String> {
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

    let bytes = fs::read(&path).map_err(|e| e.to_string())?;

    // 1. Check for BOM (Byte Order Mark)
    if let Some((encoding, _)) = Encoding::for_bom(&bytes) {
        let (cow, _) = encoding.decode_with_bom_removal(&bytes);
        return Ok(FileContent {
            content: cow.into_owned(),
            encoding: encoding.name().to_string(),
        });
    }

    // 2. Try UTF-8 (Standard)
    // We attempt to decode as UTF-8. If it fails (had_errors=true), it's likely a legacy encoding.
    let (cow, _, had_errors) = UTF_8.decode(&bytes);
    if !had_errors {
        return Ok(FileContent {
            content: cow.into_owned(),
            encoding: "UTF-8".to_string(),
        });
    }

    // 3. Fallback to Windows-1252 (ANSI / Latin1)
    // This is the standard fallback for web browsers when encoding is undefined and not UTF-8.
    let (cow, _, _) = WINDOWS_1252.decode(&bytes);
    Ok(FileContent {
        content: cow.into_owned(),
        encoding: "WINDOWS-1252".to_string(),
    })
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;

    // Write to temp file first, then rename
    let temp_path = format!("{}.tmp", path);

    // Always write UTF-8 for now (Text editors typically normalize to UTF-8 on save)
    fs::write(&temp_path, &content).map_err(|e| e.to_string())?;

    fs::rename(&temp_path, &path).map_err(|e| {
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
        .map(|p| {
            p.parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default()
        })
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
    trash::delete(&path).map_err(|e| format!("Failed to send file to recycle bin: {}", e))
}

#[tauri::command]
pub async fn add_to_dictionary(app_handle: tauri::AppHandle, word: String) -> Result<(), String> {
    let data_dir = app_handle.path().data_dir().map_err(|e| e.to_string())?;
    let dict_path = data_dir.join("MarkdownRS").join("custom-spelling.dic");

    // Check if directory exists
    let parent = dict_path.parent().ok_or("Invalid path")?;
    if !parent.exists() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Read existing words to check for duplicates
    let existing_words = if dict_path.exists() {
        fs::read_to_string(&dict_path)
            .map_err(|e| e.to_string())?
            .lines()
            .map(|line| line.trim().to_lowercase())
            .collect::<std::collections::HashSet<_>>()
    } else {
        std::collections::HashSet::new()
    };

    // Only add if word doesn't already exist (case-insensitive)
    if !existing_words.contains(&word.to_lowercase()) {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dict_path)
            .map_err(|e| e.to_string())?;

        if let Err(e) = writeln!(file, "{}", word) {
            return Err(format!("Failed to write to dictionary: {}", e));
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_custom_dictionary(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let data_dir = app_handle.path().data_dir().map_err(|e| e.to_string())?;
    let dict_path = data_dir.join("MarkdownRS").join("custom-spelling.dic");

    if !dict_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&dict_path).map_err(|e| e.to_string())?;
    let words: Vec<String> = content
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    Ok(words)
}
