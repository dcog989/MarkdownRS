use crate::db::{Database, TabState};
use chrono::{DateTime, Local};
use encoding_rs::{Encoding, UTF_8, WINDOWS_1252};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::{Manager, State};

pub struct AppState {
    pub db: Mutex<Database>,
    pub symspell: Mutex<symspell_rs::SymSpell>,
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

#[derive(serde::Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub install_path: String,
    pub data_path: String,
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
    if metadata.is_dir() {
        return Err("Cannot read a directory as a text file".to_string());
    }

    const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024; // 50MB
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large: {} MB (max {} MB)",
            metadata.len() / 1024 / 1024,
            MAX_FILE_SIZE / 1024 / 1024
        ));
    }

    let bytes = fs::read(&path).map_err(|e| e.to_string())?;

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

    let (cow, _, _) = WINDOWS_1252.decode(&bytes);
    Ok(FileContent {
        content: cow.into_owned(),
        encoding: "WINDOWS-1252".to_string(),
    })
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;
    let temp_path = format!("{}.tmp", path);
    fs::write(&temp_path, &content).map_err(|e| e.to_string())?;

    match fs::rename(&temp_path, &path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            fs::copy(&temp_path, &path).map_err(|ce| ce.to_string())?;
            let _ = fs::remove_file(&temp_path);
            Ok(())
        }
        Err(e) => {
            let _ = fs::remove_file(&temp_path);
            Err(e.to_string())
        }
    }
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
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
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
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let dict_path = app_dir.join("custom-spelling.dic");

    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

    let existing_words = if dict_path.exists() {
        fs::read_to_string(&dict_path)
            .map_err(|e| e.to_string())?
            .lines()
            .map(|line| line.trim().to_lowercase())
            .collect::<std::collections::HashSet<_>>()
    } else {
        std::collections::HashSet::new()
    };

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
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let dict_path = app_dir.join("custom-spelling.dic");

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

#[tauri::command]
pub async fn resolve_path_relative(
    base_path: Option<String>,
    click_path: String,
) -> Result<String, String> {
    let resolved = if Path::new(&click_path).is_absolute() {
        PathBuf::from(&click_path)
    } else if let Some(base) = base_path {
        let base_dir = Path::new(&base).parent().unwrap_or_else(|| Path::new(""));
        base_dir.join(click_path)
    } else {
        PathBuf::from(&click_path)
    };

    if !resolved.exists() {
        return Err("File does not exist".to_string());
    }

    resolved
        .canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn init_spellchecker(
    state: State<'_, AppState>,
    dictionary_data: String,
) -> Result<(), String> {
    let mut sym = state
        .symspell
        .lock()
        .map_err(|_| "Failed to lock symspell")?;

    // Initialize with standard defaults: max_distance=2, threshold=None, prefix_len=7, count_threshold=1
    *sym = symspell_rs::SymSpell::new(2, None, 7, 1);

    for line in dictionary_data.lines() {
        sym.load_dictionary_line(line, 0, 1, " ");
    }
    Ok(())
}

#[tauri::command]
pub async fn get_spelling_suggestions(
    state: State<'_, AppState>,
    word: String,
) -> Result<Vec<String>, String> {
    let sym = state
        .symspell
        .lock()
        .map_err(|_| "Failed to lock symspell")?;

    // Signature: (input, verbosity, max_edit_distance, custom_dict, transfer_casing, include_unknown)
    let suggestions = sym.lookup(
        &word.to_lowercase(),
        symspell_rs::Verbosity::Top,
        2,
        &None,
        None,
        false,
    );

    Ok(suggestions.into_iter().map(|s| s.term).take(3).collect())
}
