use crate::db::{Bookmark, Database, TabState};
use crate::markdown_config::MarkdownFlavor;
use crate::markdown_formatter::{self, FormatterOptions};
use crate::markdown_renderer::{self, MarkdownOptions, RenderResult};
use crate::text_transforms::transform_text;
use chrono::{DateTime, Local};
use encoding_rs::{Encoding, UTF_8};
use log;
use spellbook::Dictionary;
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{Manager, State};
use tokio::sync::Mutex;
use unicode_bom::Bom;

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
    pub cache_path: String,
    pub logs_path: String,
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
pub async fn save_session(
    state: State<'_, AppState>,
    mut tabs: Vec<TabState>,
) -> Result<(), String> {
    // Normalize line endings to LF before saving to ensure consistent database storage
    for tab in &mut tabs {
        tab.content = tab.content.replace("\r\n", "\n");
    }

    let mut db = state.db.lock().await;
    db.save_session(&tabs).map_err(|e| {
        log::error!("Failed to save session: {}", e);
        format!("Failed to save session: {}", e)
    })
}

#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> Result<Vec<TabState>, String> {
    let db = state.db.lock().await;
    db.load_session().map_err(|e| {
        log::error!("Failed to restore session: {}", e);
        format!("Failed to restore session: {}", e)
    })
}

#[tauri::command]
pub async fn vacuum_database(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;

    // Check if there are any free pages to reclaim
    let freelist_count = db.get_freelist_count().map_err(|e| {
        log::error!("Failed to get freelist count: {}", e);
        format!("Failed to check database: {}", e)
    })?;

    if freelist_count > 0 {
        log::info!(
            "Vacuuming database: {} free pages to reclaim",
            freelist_count
        );
        // Reclaim up to 100 pages at a time to avoid blocking
        db.incremental_vacuum(100).map_err(|e| {
            log::error!("Failed to vacuum database: {}", e);
            format!("Failed to vacuum database: {}", e)
        })?;
    } else {
        log::debug!("No free pages to reclaim in database");
    }

    Ok(())
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<FileContent, String> {
    validate_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|e| {
        log::error!("Failed to read metadata for '{}': {}", path, e);
        format!("Failed to access file: {}", e)
    })?;
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
    let bytes = fs::read(&path).map_err(|e| {
        log::error!("Failed to read file '{}': {}", path, e);
        format!("Failed to read file: {}", e)
    })?;
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
    fs::write(&temp_path, &content).map_err(|e| {
        log::error!("Failed to write temporary file '{}': {}", temp_path, e);
        format!("Failed to write file: {}", e)
    })?;
    match fs::rename(&temp_path, &path) {
        Ok(_) => {
            log::debug!("Successfully wrote file: {}", path);
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            log::debug!(
                "Cross-device rename failed, falling back to copy for: {}",
                path
            );
            fs::copy(&temp_path, &path).map_err(|ce| {
                log::error!(
                    "Failed to copy file from '{}' to '{}': {}",
                    temp_path,
                    path,
                    ce
                );
                format!("Failed to save file: {}", ce)
            })?;
            let _ = fs::remove_file(&temp_path);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to rename '{}' to '{}': {}", temp_path, path, e);
            let _ = fs::remove_file(&temp_path);
            Err(format!("Failed to save file: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    validate_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|e| {
        log::debug!("Failed to get metadata for '{}': {}", path, e);
        format!("Failed to get file metadata: {}", e)
    })?;
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
    let cache_path = app_handle
        .path()
        .app_local_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let logs_path = app_handle
        .path()
        .app_local_data_dir()
        .map(|p| p.join("Logs").to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(AppInfo {
        name: "MarkdownRS".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        install_path,
        data_path,
        cache_path,
        logs_path,
    })
}

#[tauri::command]
pub async fn send_to_recycle_bin(path: String) -> Result<(), String> {
    validate_path(&path)?;
    trash::delete(&path).map_err(|e| {
        log::error!("Failed to send file to recycle bin '{}': {}", path, e);
        format!("Failed to send file to recycle bin: {}", e)
    })
}

#[tauri::command]
pub async fn add_to_dictionary(app_handle: tauri::AppHandle, word: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| {
        log::error!("Failed to get app data directory: {}", e);
        format!("Failed to access app data: {}", e)
    })?;
    let dict_path = app_dir.join("custom-spelling.dic");
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| {
            log::error!("Failed to create app data directory: {}", e);
            format!("Failed to create directory: {}", e)
        })?;
    }

    // Check existing words safely
    let word_exists = if dict_path.exists() {
        let content = fs::read_to_string(&dict_path).map_err(|e| {
            log::error!("Failed to read custom dictionary: {}", e);
            format!("Failed to read dictionary: {}", e)
        })?;
        content
            .lines()
            .any(|line| line.trim().eq_ignore_ascii_case(&word))
    } else {
        false
    };

    if !word_exists {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dict_path)
            .map_err(|e| {
                log::error!("Failed to open custom dictionary for writing: {}", e);
                format!("Failed to open dictionary: {}", e)
            })?;
        if let Err(e) = writeln!(file, "{}", word) {
            log::error!("Failed to write word '{}' to dictionary: {}", word, e);
            return Err(format!("Failed to write to dictionary: {}", e));
        } else {
            log::info!("Added word '{}' to custom dictionary", word);
        }
    }

    let state = app_handle.state::<AppState>();
    let mut custom_dict = state.custom_dict.lock().await;
    custom_dict.insert(word.to_lowercase());

    Ok(())
}

#[tauri::command]
pub async fn get_custom_dictionary(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| {
        log::error!(
            "Failed to get app data directory for custom dictionary: {}",
            e
        );
        format!("Failed to access dictionary: {}", e)
    })?;
    let dict_path = app_dir.join("custom-spelling.dic");
    if !dict_path.exists() {
        log::debug!("Custom dictionary does not exist yet");
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&dict_path).map_err(|e| {
        log::error!("Failed to read custom dictionary: {}", e);
        format!("Failed to read dictionary: {}", e)
    })?;

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
        // Use PathBuf to own the data and avoid lifetime issues with parent() returns
        let mut path_buf = PathBuf::from(base);
        path_buf.pop(); // Remove filename to get directory (effectively .parent())
        path_buf.push(click_path);
        path_buf
    } else {
        PathBuf::from(&click_path)
    };

    if !resolved.exists() {
        log::debug!("Resolved path does not exist: {:?}", resolved);
        return Err("File does not exist".to_string());
    }

    resolved
        .canonicalize()
        .map(|p| {
            log::debug!("Resolved path: {:?}", p);
            p.to_string_lossy().to_string()
        })
        .map_err(|e| {
            log::error!("Failed to canonicalize path {:?}: {}", resolved, e);
            format!("Failed to resolve path: {}", e)
        })
}

#[tauri::command]
pub async fn init_spellchecker(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Initializing spellchecker");
    let local_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        log::error!("Failed to get local data directory: {}", e);
        format!("Failed to initialize spellchecker: {}", e)
    })?;
    let cache_dir = local_dir.join("spellcheck_cache");
    let aff_path = cache_dir.join("en_US.aff");
    let dic_path = cache_dir.join("en_US.dic");
    let jargon_path = cache_dir.join("jargon.dic");

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let custom_path = app_dir.join("custom-spelling.dic");

    let speller_arc = state.speller.clone();
    let custom_arc = state.custom_dict.clone();

    if !cache_dir.exists() {
        log::info!("Creating spellcheck cache directory: {:?}", cache_dir);
        fs::create_dir_all(&cache_dir).map_err(|e| {
            log::error!("Failed to create spellcheck cache directory: {}", e);
            format!("Failed to create cache directory: {}", e)
        })?;
    }

    // Download dictionaries if missing
    if !aff_path.exists() || !dic_path.exists() || !jargon_path.exists() {
        log::info!("Downloading spellcheck dictionary files");
        let client = reqwest::blocking::Client::new();

        let files = [
            (
                "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/index.aff",
                &aff_path,
                ".aff",
            ),
            (
                "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/index.dic",
                &dic_path,
                ".dic",
            ),
            (
                "https://raw.githubusercontent.com/smoeding/hunspell-jargon/master/jargon.dic",
                &jargon_path,
                "jargon",
            ),
        ];

        for (url, path, name) in files {
            if let Ok(resp) = client.get(url).send() {
                if resp.status().is_success() {
                    if let Ok(text) = resp.text() {
                        log::info!("Downloaded {} dictionary file", name);
                        let _ = fs::write(path, text);
                    }
                }
            }
        }
    }

    if aff_path.exists() && dic_path.exists() {
        if let Ok(raw_aff) = fs::read_to_string(&aff_path) {
            if let Ok(raw_dic) = fs::read_to_string(&dic_path) {
                log::debug!("Successfully read dictionary files");
                let mut combined_dic = raw_dic.clone();
                if jargon_path.exists() {
                    if let Ok(jargon_content) = fs::read_to_string(&jargon_path) {
                        if let Some((_, jargon_words)) = jargon_content.split_once('\n') {
                            combined_dic.push_str("\n");
                            combined_dic.push_str(jargon_words);
                        }
                    }
                }

                let aff_content = raw_aff.trim_start_matches('\u{feff}');
                let dic_content = sanitize_dic_content(&combined_dic);

                match Dictionary::new(aff_content, &dic_content) {
                    Ok(dict) => {
                        let mut speller = speller_arc.lock().await;
                        *speller = Some(dict);
                        log::info!("Spellchecker initialized successfully");
                    }
                    Err(e) => {
                        log::error!(
                            "[Spellcheck] Failed to create dictionary: {:?} - Cleaning up cache files",
                            e
                        );
                        let _ = fs::remove_file(&aff_path);
                        let _ = fs::remove_file(&dic_path);
                        let _ = fs::remove_file(&jargon_path);
                    }
                }
            } else {
                log::error!("Failed to read .dic file: {:?}", dic_path);
            }
        } else {
            log::error!("Failed to read .aff file: {:?}", aff_path);
        }
    } else {
        log::warn!("[Spellcheck] Dictionary files missing after download attempt");
    }

    if custom_path.exists() {
        if let Ok(text) = fs::read_to_string(&custom_path) {
            let mut custom = custom_arc.lock().await;
            for line in text.lines() {
                let w = line.trim();
                if !w.is_empty() {
                    custom.insert(w.to_lowercase());
                }
            }
        }
    }

    Ok(())
}

fn sanitize_dic_content(content: &str) -> String {
    let content = content.trim_start_matches('\u{feff}');
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");

    if let Some((first_line, rest)) = normalized.split_once('\n') {
        let clean_count = first_line.trim();
        if clean_count.chars().all(|c| c.is_ascii_digit()) {
            format!("{}\n{}", clean_count, rest)
        } else {
            let line_count = normalized.lines().count();
            format!("{}\n{}", line_count, normalized)
        }
    } else {
        content.trim().to_string()
    }
}

#[tauri::command]
pub async fn check_words(
    state: State<'_, AppState>,
    words: Vec<String>,
) -> Result<Vec<String>, String> {
    let speller_guard = state.speller.lock().await;
    let custom_guard = state.custom_dict.lock().await;

    let speller = match speller_guard.as_ref() {
        Some(s) => s,
        None => {
            log::warn!("[Spellcheck] Check requested but dictionary not loaded");
            return Ok(Vec::new());
        }
    };

    let misspelled: Vec<String> = words
        .into_iter()
        .filter(|word| {
            let clean = word.trim();
            if clean.is_empty() {
                return false;
            }
            if custom_guard.contains(&clean.to_lowercase()) {
                return false;
            }
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
    let speller_guard = state.speller.lock().await;

    let speller = match speller_guard.as_ref() {
        Some(s) => s,
        None => return Ok(Vec::new()),
    };

    let mut suggestions = Vec::new();
    speller.suggest(&word, &mut suggestions);
    Ok(suggestions.into_iter().take(5).collect())
}

#[tauri::command]
pub async fn render_markdown(
    content: String,
    flavor: Option<String>,
) -> Result<RenderResult, String> {
    let markdown_flavor = flavor
        .and_then(|f| MarkdownFlavor::from_str(&f))
        .unwrap_or_default();

    let options = MarkdownOptions {
        flavor: markdown_flavor,
    };

    markdown_renderer::render_markdown(&content, options).map_err(|e| {
        log::error!("Failed to render markdown: {}", e);
        e
    })
}

#[tauri::command]
pub async fn format_markdown(
    content: String,
    flavor: Option<String>,
    list_indent: Option<usize>,
    bullet_char: Option<String>,
    code_block_fence: Option<String>,
    table_alignment: Option<bool>,
) -> Result<String, String> {
    let markdown_flavor = flavor
        .and_then(|f| MarkdownFlavor::from_str(&f))
        .unwrap_or_default();

    let options = FormatterOptions {
        flavor: markdown_flavor,
        list_indent: list_indent.unwrap_or(2),
        bullet_char: bullet_char.unwrap_or_else(|| "-".to_string()),
        code_block_fence: code_block_fence.unwrap_or_else(|| "```".to_string()),
        table_alignment: table_alignment.unwrap_or(true),
        normalize_whitespace: true,
        max_blank_lines: 2,
    };

    markdown_formatter::format_markdown(&content, &options).map_err(|e| {
        log::error!("Failed to format markdown: {}", e);
        e
    })
}

#[tauri::command]
pub async fn get_markdown_flavors() -> Result<Vec<String>, String> {
    Ok(vec!["commonmark".to_string(), "gfm".to_string()])
}

#[tauri::command]
pub async fn transform_text_content(
    content: String,
    operation: String,
    indent_width: Option<usize>,
) -> Result<String, String> {
    transform_text(&content, &operation, indent_width.unwrap_or(4)).map_err(|e| {
        log::error!(
            "Failed to transform text with operation '{}': {}",
            operation,
            e
        );
        e
    })
}

#[tauri::command]
pub async fn add_bookmark(state: State<'_, AppState>, bookmark: Bookmark) -> Result<(), String> {
    let db = state.db.lock().await;
    db.add_bookmark(&bookmark).map_err(|e| {
        log::error!("Failed to add bookmark '{}': {}", bookmark.path, e);
        format!("Failed to add bookmark: {}", e)
    })
}

#[tauri::command]
pub async fn get_all_bookmarks(state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> {
    let db = state.db.lock().await;
    db.get_all_bookmarks().map_err(|e| {
        log::error!("Failed to retrieve bookmarks: {}", e);
        format!("Failed to retrieve bookmarks: {}", e)
    })
}

#[tauri::command]
pub async fn delete_bookmark(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_bookmark(&id).map_err(|e| {
        log::error!("Failed to delete bookmark '{}': {}", id, e);
        format!("Failed to delete bookmark: {}", e)
    })
}

#[tauri::command]
pub async fn update_bookmark_access_time(
    state: State<'_, AppState>,
    id: String,
    last_accessed: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_bookmark_access_time(&id, &last_accessed)
        .map_err(|e| {
            log::error!("Failed to update bookmark access time for '{}': {}", id, e);
            format!("Failed to update bookmark: {}", e)
        })
}

#[tauri::command]
pub async fn get_available_themes(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| {
        log::error!("Failed to get app data directory for themes: {}", e);
        format!("Failed to access themes: {}", e)
    })?;
    let themes_dir = app_dir.join("Themes");

    let mut themes = Vec::new();
    if let Ok(entries) = fs::read_dir(themes_dir) {
        log::debug!("Scanning themes directory");
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|s| s.to_str()) == Some("css") {
                if let Some(name) = entry.path().file_stem().and_then(|s| s.to_str()) {
                    themes.push(name.to_string());
                }
            }
        }
    }
    Ok(themes)
}

#[tauri::command]
pub async fn get_theme_css(
    app_handle: tauri::AppHandle,
    theme_name: String,
) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| {
        log::error!("Failed to get app data directory for theme CSS: {}", e);
        format!("Failed to access theme: {}", e)
    })?;
    let themes_dir = app_dir.join("Themes");
    let theme_path = themes_dir.join(format!("{}.css", theme_name));

    if !theme_path.exists() {
        log::warn!("Theme '{}' not found at path: {:?}", theme_name, theme_path);
        return Err(format!("Custom theme '{}' not found", theme_name));
    }

    fs::read_to_string(theme_path).map_err(|e| {
        log::error!("Failed to read theme '{}': {}", theme_name, e);
        format!("Failed to load theme: {}", e)
    })
}

#[tauri::command]
pub async fn load_settings(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| {
        log::error!("Failed to get app data directory for load_settings: {}", e);
        format!("Failed to access app data: {}", e)
    })?;
    let path = app_dir.join("settings.toml");

    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let raw_bytes = fs::read(&path).map_err(|e| {
        log::error!("Failed to read settings file: {}", e);
        format!("Failed to read settings: {}", e)
    })?;

    // Strip BOM using unicode-bom crate for robust handling
    let content = match Bom::from(raw_bytes.as_slice()) {
        Bom::Null => {
            // No BOM detected, decode as UTF-8
            String::from_utf8_lossy(&raw_bytes).to_string()
        }
        bom => {
            // BOM detected, strip it and decode the rest
            let without_bom = &raw_bytes[bom.len()..];
            String::from_utf8_lossy(without_bom).to_string()
        }
    };

    let toml_val: toml::Value = toml::from_str(&content).map_err(|e| {
        log::error!("Failed to parse settings TOML: {}", e);
        format!("Failed to parse settings: {}", e)
    })?;

    Ok(serde_json::to_value(toml_val).map_err(|e| {
        log::error!("Failed to convert settings to JSON: {}", e);
        format!("Failed to process settings: {}", e)
    })?)
}

#[tauri::command]
pub async fn save_settings(
    app_handle: tauri::AppHandle,
    settings: serde_json::Value,
) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| {
        log::error!("Failed to get app data directory for save_settings: {}", e);
        format!("Failed to access app data: {}", e)
    })?;
    let path = app_dir.join("settings.toml");

    let toml_str = toml::to_string_pretty(&settings).map_err(|e| {
        log::error!("Failed to serialize settings to TOML: {}", e);
        format!("Failed to save settings: {}", e)
    })?;
    fs::write(path, toml_str).map_err(|e| {
        log::error!("Failed to write settings file: {}", e);
        format!("Failed to save settings: {}", e)
    })?;
    log::info!("Settings saved successfully");
    Ok(())
}

#[tauri::command]
pub async fn write_binary_file(path: String, content: Vec<u8>) -> Result<(), String> {
    validate_path(&path)?;
    fs::write(&path, &content).map_err(|e| {
        log::error!("Failed to write binary file '{}': {}", path, e);
        format!("Failed to write file: {}", e)
    })?;
    log::debug!("Successfully wrote binary file: {}", path);
    Ok(())
}
