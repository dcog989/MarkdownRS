use crate::db::{Database, TabState};
use crate::markdown_formatter::{FormatterOptions, format_markdown};
use crate::markdown_renderer::{MarkdownOptions, RenderResult, render_markdown};
use crate::text_metrics::{
    CursorMetrics, TextMetrics, calculate_cursor_metrics, calculate_text_metrics,
};
use crate::text_transforms::transform_text;
use chrono::{DateTime, Local};
use encoding_rs::{Encoding, UTF_8};
use spellbook::Dictionary;
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::{Manager, State};

pub struct AppState {
    pub db: Mutex<Database>,
    pub speller: Arc<Mutex<Option<Dictionary>>>,
    pub custom_dict: Arc<Mutex<HashSet<String>>>,
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
    let mut db = state.db.lock().map_err(|_| "Failed to lock db")?;
    db.save_session(&tabs).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> Result<Vec<TabState>, String> {
    let db = state.db.lock().map_err(|_| "Failed to lock db")?;
    db.load_session().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<FileContent, String> {
    validate_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        return Err("Cannot read a directory as a text file".to_string());
    }
    const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;
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
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(&bytes, true);
    let detected_encoding = detector.guess(None, false);
    let (cow, _, _) = detected_encoding.decode(&bytes);
    Ok(FileContent {
        content: cow.into_owned(),
        encoding: detected_encoding.name().to_string(),
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
            .collect::<HashSet<_>>()
    } else {
        HashSet::new()
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

    if let Ok(mut custom_dict) = app_handle.state::<AppState>().custom_dict.lock() {
        custom_dict.insert(word.to_lowercase());
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
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let cache_dir = app_dir.join("spellcheck_cache");
    let aff_path = cache_dir.join("en_US.aff");
    let dic_path = cache_dir.join("en_US.dic");
    let jargon_path = cache_dir.join("jargon.dic");
    let custom_path = app_dir.join("custom-spelling.dic");

    let speller_arc = state.speller.clone();
    let custom_arc = state.custom_dict.clone();

    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    // Delete any existing corrupted dictionary files before spawning thread
    if aff_path.exists() {
        if let Ok(content) = fs::read_to_string(&aff_path) {
            if content.contains("404") || content.contains("Not Found") || content.len() < 100 {
                println!("[Spellcheck] Deleting corrupted .aff file");
                let _ = fs::remove_file(&aff_path);
            }
        }
    }
    if dic_path.exists() {
        if let Ok(content) = fs::read_to_string(&dic_path) {
            if content.contains("404") || content.contains("Not Found") || content.len() < 100 {
                println!("[Spellcheck] Deleting corrupted .dic file");
                let _ = fs::remove_file(&dic_path);
            }
        }
    }

    std::thread::spawn(move || {
        println!("[Spellcheck] Initializing...");

        // 1. Download Dictionaries if needed
        if !aff_path.exists() || !dic_path.exists() || !jargon_path.exists() {
            println!("[Spellcheck] Downloading Hunspell dictionary...");
            let client = reqwest::blocking::Client::new();

            let aff_url = "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/index.aff";
            let dic_url = "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/index.dic";

            match client.get(aff_url).send() {
                Ok(resp) => {
                    if resp.status().is_success() {
                        if let Ok(text) = resp.text() {
                            if let Err(e) = fs::write(&aff_path, text) {
                                println!("[Spellcheck] Failed to write .aff file: {}", e);
                            } else {
                                println!("[Spellcheck] Downloaded .aff file successfully");
                            }
                        }
                    } else {
                        println!("[Spellcheck] Failed to download .aff: HTTP {}", resp.status());
                    }
                }
                Err(e) => println!("[Spellcheck] Network error downloading .aff: {}", e),
            }

            match client.get(dic_url).send() {
                Ok(resp) => {
                    if resp.status().is_success() {
                        if let Ok(text) = resp.text() {
                            if let Err(e) = fs::write(&dic_path, text) {
                                println!("[Spellcheck] Failed to write .dic file: {}", e);
                            } else {
                                println!("[Spellcheck] Downloaded .dic file successfully");
                            }
                        }
                    } else {
                        println!("[Spellcheck] Failed to download .dic: HTTP {}", resp.status());
                    }
                }
                Err(e) => println!("[Spellcheck] Network error downloading .dic: {}", e),
            }

            // Download technical jargon dictionary
            let jargon_url = "https://raw.githubusercontent.com/smoeding/hunspell-jargon/master/jargon.dic";
            match client.get(jargon_url).send() {
                Ok(resp) => {
                    if resp.status().is_success() {
                        if let Ok(text) = resp.text() {
                            if let Err(e) = fs::write(&jargon_path, text) {
                                println!("[Spellcheck] Failed to write jargon.dic file: {}", e);
                            } else {
                                println!("[Spellcheck] Downloaded jargon.dic file successfully");
                            }
                        }
                    } else {
                        println!("[Spellcheck] Failed to download jargon.dic: HTTP {}", resp.status());
                    }
                }
                Err(e) => println!("[Spellcheck] Network error downloading jargon.dic: {}", e),
            }
        }

        // 2. Load Dictionary with technical jargon
        if aff_path.exists() && dic_path.exists() {
            if let Ok(raw_aff) = fs::read_to_string(&aff_path) {
                if let Ok(raw_dic) = fs::read_to_string(&dic_path) {
                    // Merge jargon dictionary if it exists
                    let mut combined_dic = raw_dic.clone();
                    if jargon_path.exists() {
                        if let Ok(jargon_content) = fs::read_to_string(&jargon_path) {
                            // Append jargon words to main dictionary
                            // Skip the first line (word count) from jargon
                            if let Some((_first_line, jargon_words)) = jargon_content.split_once('\n') {
                                combined_dic.push_str("\n");
                                combined_dic.push_str(jargon_words);
                                println!("[Spellcheck] Merged technical jargon dictionary");
                            }
                        }
                    }
                    let raw_dic = combined_dic;
                    // Check if files contain error messages instead of dictionary data
                    if raw_aff.contains("404") || raw_aff.contains("Not Found") || 
                       raw_dic.contains("404") || raw_dic.contains("Not Found") {
                        println!("[Spellcheck] Dictionary files are corrupted (contain error pages). Deleting...");
                        let _ = fs::remove_file(&aff_path);
                        let _ = fs::remove_file(&dic_path);
                        println!("[Spellcheck] Please restart the app to re-download dictionaries.");
                        return;
                    }

                    // Sanitize inputs:
                    // 1. Remove BOM
                    // 2. Ensure first line (word count) is purely numeric (trim \r, spaces)
                    let aff_content = raw_aff.trim_start_matches('\u{feff}');
                    let dic_content = sanitize_dic_content(&raw_dic);

                    match Dictionary::new(aff_content, &dic_content) {
                        Ok(dict) => {
                            if let Ok(mut speller) = speller_arc.lock() {
                                *speller = Some(dict);
                                println!("[Spellcheck] Dictionary loaded successfully with technical jargon.");
                            }
                        }
                        Err(e) => {
                            println!("[Spellcheck] Failed to build dictionary: {}", e);
                            // Diagnostic: Print first 50 chars to see what's wrong
                            let preview: String = dic_content.chars().take(50).collect();
                            println!("[Spellcheck] DIC File Header Preview: {:?}", preview);
                            println!("[Spellcheck] Deleting corrupted files. Please restart to re-download.");
                            let _ = fs::remove_file(&aff_path);
                            let _ = fs::remove_file(&dic_path);
                            let _ = fs::remove_file(&jargon_path);
                        }
                    }
                }
            }
        }

        // 3. Load Custom Dictionary
        if custom_path.exists() {
            if let Ok(text) = fs::read_to_string(&custom_path) {
                if let Ok(mut custom) = custom_arc.lock() {
                    for line in text.lines() {
                        let w = line.trim();
                        if !w.is_empty() {
                            custom.insert(w.to_lowercase());
                        }
                    }
                    println!("[Spellcheck] Custom words loaded.");
                }
            }
        }
    });

    Ok(())
}

// Helper to strictly sanitize the .dic file format
fn sanitize_dic_content(content: &str) -> String {
    let content = content.trim_start_matches('\u{feff}');

    // Split once to separate count from words
    // We treat \n as the delimiter, but handle \r in the first part
    if let Some((first_line, rest)) = content.split_once('\n') {
        let clean_count = first_line.trim();
        // Reconstruct with a clean newline
        format!("{}\n{}", clean_count, rest)
    } else {
        // Single line file (unlikely valid, but just trim it)
        content.trim().to_string()
    }
}

#[tauri::command]
pub async fn check_words(
    state: State<'_, AppState>,
    words: Vec<String>,
) -> Result<Vec<String>, String> {
    let speller_guard = state.speller.lock().map_err(|_| "Lock failed")?;
    let custom_guard = state.custom_dict.lock().map_err(|_| "Lock failed")?;

    let speller = match speller_guard.as_ref() {
        Some(s) => s,
        None => return Ok(Vec::new()), // Not loaded yet
    };

    let misspelled: Vec<String> = words
        .into_iter()
        .filter(|word| {
            let clean = word.trim();
            if clean.is_empty() {
                return false;
            }

            // Check custom first
            if custom_guard.contains(&clean.to_lowercase()) {
                return false;
            }

            // Check spellbook
            !speller.check(clean)
        })
        .collect();

    Ok(misspelled)
}

#[tauri::command]
pub async fn get_spelling_suggestions(
    state: State<'_, AppState>,
    word: String,
) -> Result<Vec<String>, String> {
    let speller_guard = state.speller.lock().map_err(|_| "Lock failed")?;

    let speller = match speller_guard.as_ref() {
        Some(s) => s,
        None => return Ok(Vec::new()),
    };

    let mut suggestions = Vec::new();

    speller.suggest(&word, &mut suggestions);

    Ok(suggestions.into_iter().take(5).collect())
}

#[tauri::command]
pub async fn render_markdown_content(content: String, gfm: bool) -> Result<RenderResult, String> {
    let options = MarkdownOptions { gfm };
    render_markdown(&content, options)
}

#[tauri::command]
pub async fn transform_text_content(content: String, operation: String) -> Result<String, String> {
    transform_text(&content, &operation)
}

#[tauri::command]
pub async fn format_markdown_content(
    content: String,
    list_indent: usize,
    bullet_char: String,
    code_block_fence: String,
    table_alignment: bool,
) -> Result<String, String> {
    let options = FormatterOptions {
        list_indent,
        bullet_char,
        code_block_fence,
        table_alignment,
    };
    format_markdown(&content, &options)
}

#[tauri::command]
pub async fn calculate_text_metrics_command(content: String) -> Result<TextMetrics, String> {
    Ok(calculate_text_metrics(&content))
}

#[tauri::command]
pub async fn calculate_cursor_metrics_command(
    content: String,
    cursor_offset: usize,
) -> Result<CursorMetrics, String> {
    calculate_cursor_metrics(&content, cursor_offset)
}
