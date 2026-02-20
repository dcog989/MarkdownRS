use crate::utils::{handle_error, read_text_with_bom_detection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;
use tauri::Manager;
use tokio::fs;
use tokio::sync::Mutex;

static THEME_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub install_path: String,
    pub data_path: String,
    pub cache_path: String,
    pub logs_path: String,
    pub os_platform: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub active_tab_id: Option<String>,
    pub split_view: bool,
    pub theme: String,
    pub active_theme: String,
    pub available_themes: Vec<String>,
    pub split_percentage: f64,
    pub split_orientation: String,
    pub tab_cycling: String,
    pub tab_width_min: u32,
    pub tab_width_max: u32,
    pub status_bar_transparency: u32,
    pub new_tab_position: String,
    pub startup_behavior: String,
    pub editor_font_family: String,
    pub editor_font_size: u32,
    pub editor_word_wrap: bool,
    pub show_whitespace: bool,
    pub enable_autocomplete: bool,
    pub autocomplete_delay: u32,
    pub recent_changes_timespan: u32,
    pub recent_changes_count: u32,
    pub undo_depth: u32,
    pub preview_font_family: String,
    pub preview_font_size: u32,
    pub gfm_enabled: bool,
    pub markdown_flavor: String,
    pub log_level: String,
    pub format_on_save: bool,
    pub format_on_paste: bool,
    pub default_indent: u32,
    pub formatter_bullet_char: String,
    pub formatter_emphasis_char: String,
    pub formatter_code_fence: String,
    pub formatter_table_alignment: bool,
    pub line_ending_preference: String,
    pub tooltip_delay: u32,
    pub find_panel_transparent: bool,
    pub find_panel_close_on_blur: bool,
    pub language_dictionaries: Vec<String>,
    pub technical_dictionaries: bool,
    pub science_dictionaries: bool,
    pub tab_name_from_content: bool,
    pub wrap_guide_column: u32,
    pub double_click_selects_trailing_space: bool,
    pub collapse_pinned_tabs: bool,
    pub custom_shortcuts: HashMap<String, String>,
    pub confirmation_suppressed: bool,
    pub max_file_size_mb: u64,
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

    let os_platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
    .to_string();

    Ok(AppInfo {
        name: "MarkdownRS".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        install_path,
        data_path,
        cache_path,
        logs_path,
        os_platform,
    })
}

#[tauri::command]
pub async fn get_available_themes(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| handle_error(None, "get app data directory for themes", e))?;
    let themes_dir = app_dir.join("Themes");

    let mut themes = Vec::new();
    match fs::read_dir(&themes_dir).await {
        Ok(mut entries) => {
            log::debug!("Scanning themes directory");
            while let Some(entry) = entries.next_entry().await.transpose() {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if let Some(name) = path
                        .extension()
                        .filter(|&s| s == "css")
                        .and_then(|_| path.file_stem())
                        .and_then(|s| s.to_str())
                    {
                        themes.push(name.to_string());
                    }
                }
            }
        },
        Err(e) => {
            log::debug!("Themes directory not accessible: {}", e);
        },
    }
    Ok(themes)
}

#[tauri::command]
pub async fn get_theme_css(
    app_handle: tauri::AppHandle,
    theme_name: String,
) -> Result<String, String> {
    {
        let cache = THEME_CACHE.lock().await;
        if let Some(css) = cache.get(&theme_name) {
            return Ok(css.clone());
        }
    }

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| handle_error(None, "get app data directory for theme CSS", e))?;
    let themes_dir = app_dir.join("Themes");
    let theme_path = themes_dir.join(format!("{}.css", theme_name));

    match fs::try_exists(&theme_path).await {
        Ok(false) | Err(_) => {
            log::warn!("Theme '{}' not found at path: {:?}", theme_name, theme_path);
            return Err(format!("Custom theme '{}' not found", theme_name));
        },
        Ok(true) => {},
    }

    let css = fs::read_to_string(&theme_path)
        .await
        .map_err(|e| handle_error(Some(&theme_path.to_string_lossy()), "read theme", e))?;

    let mut cache = THEME_CACHE.lock().await;
    cache.insert(theme_name, css.clone());

    Ok(css)
}

async fn read_settings_file(app_handle: &tauri::AppHandle) -> Result<Option<String>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| handle_error(None, "get app data directory for load_settings", e))?;
    let path = app_dir.join("settings.toml");

    match fs::try_exists(&path).await {
        Ok(false) | Err(_) => return Ok(None),
        Ok(true) => {},
    }

    let raw_bytes = fs::read(&path)
        .await
        .map_err(|e| handle_error(Some(&path.to_string_lossy()), "read settings file", e))?;

    Ok(Some(read_text_with_bom_detection(&raw_bytes)))
}

#[tauri::command]
pub async fn load_settings(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let content = match read_settings_file(&app_handle).await? {
        Some(c) => c,
        None => return Ok(serde_json::json!({})),
    };

    let toml_val: toml::Value =
        toml::from_str(&content).map_err(|e| handle_error(None, "parse settings TOML", e))?;

    serde_json::to_value(toml_val).map_err(|e| handle_error(None, "convert settings to JSON", e))
}

/// Load raw TOML settings as toml::Value to extract specific fields without losing data
async fn load_settings_toml(app_handle: &tauri::AppHandle) -> Result<toml::Value, String> {
    let content = match read_settings_file(app_handle).await? {
        Some(c) => c,
        None => return Ok(toml::Value::Table(toml::map::Map::new())),
    };

    toml::from_str(&content).map_err(|e| handle_error(None, "parse settings TOML", e))
}

/// Get the current max file size in bytes from settings
/// Returns the configured value or default (50 MB)
pub async fn get_max_file_size_bytes(app_handle: &tauri::AppHandle) -> u64 {
    match load_settings_toml(app_handle).await {
        Ok(toml_val) => {
            // Support both camelCase (from frontend) and snake_case (Rust convention)
            let mb = toml_val
                .get("maxFileSizeMB")
                .or_else(|| toml_val.get("max_file_size_mb"))
                .and_then(|v| v.as_integer())
                .unwrap_or(50);
            (mb as u64).clamp(1, 500) * 1024 * 1024
        },
        Err(_) => 50 * 1024 * 1024,
    }
}

#[tauri::command]
pub async fn save_settings(
    app_handle: tauri::AppHandle,
    settings: serde_json::Value,
) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| handle_error(None, "get app data directory for save_settings", e))?;
    let path = app_dir.join("settings.toml");

    // Log what we received
    let max_size_received = settings
        .get("maxFileSizeMB")
        .or_else(|| settings.get("max_file_size_mb"))
        .cloned();
    log::info!(
        "save_settings called with maxFileSizeMB: {:?}",
        max_size_received
    );

    // Validate maxFileSizeMB if present (clamp to 1-500)
    let mut settings = settings;
    if let Some(max_size) = settings
        .get("maxFileSizeMB")
        .or_else(|| settings.get("max_file_size_mb"))
        && let Some(val) = max_size.as_u64()
    {
        let clamped = val.clamp(1, 500);
        settings["maxFileSizeMB"] = serde_json::json!(clamped);
        // Also remove snake_case key if present to avoid duplicates
        if let Some(obj) = settings.as_object_mut() {
            obj.remove("max_file_size_mb");
        }
    }

    let toml_str = toml::to_string_pretty(&settings)
        .map_err(|e| handle_error(None, "serialize settings to TOML", e))?;
    fs::write(&path, toml_str)
        .await
        .map_err(|e| handle_error(Some(&path.to_string_lossy()), "write settings file", e))?;
    log::info!("Settings saved successfully to {:?}", path);
    Ok(())
}

#[cfg(target_os = "windows")]
mod windows_registry {
    use winreg::RegKey;
    use winreg::enums::*;

    pub fn set_context_menu() -> Result<(), String> {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_str = exe_path.to_str().ok_or("Invalid executable path")?;
        let exe_name = exe_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("markdown-rs.exe");

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        // 1. Classic Context Menu (Right-click background / file) -> "Show more options"
        // HKCU\Software\Classes\*\shell\MarkdownRS
        {
            let path = r"Software\Classes\*\shell\MarkdownRS";
            let (key, _) = hkcu.create_subkey(path).map_err(|e| e.to_string())?;

            key.set_value("", &"Open with MarkdownRS")
                .map_err(|e| e.to_string())?;
            key.set_value("Icon", &exe_str).map_err(|e| e.to_string())?;

            let (cmd_key, _) = key.create_subkey("command").map_err(|e| e.to_string())?;
            cmd_key
                .set_value("", &format!("\"{}\" \"%1\"", exe_str))
                .map_err(|e| e.to_string())?;
        }

        // 2. Application Registration (Crucial for "Open With" submenu availability)
        // HKCU\Software\Classes\Applications\markdown-rs.exe
        {
            let app_path = format!(r"Software\Classes\Applications\{}", exe_name);
            let (app_key, _) = hkcu.create_subkey(&app_path).map_err(|e| e.to_string())?;

            if let Err(e) = app_key.set_value("FriendlyAppName", &"MarkdownRS") {
                log::warn!("Failed to set FriendlyAppName: {}", e);
            }

            // "SupportedTypes" helps Windows know this app handles these files
            let (types_key, _) = app_key
                .create_subkey("SupportedTypes")
                .map_err(|e| e.to_string())?;
            for ext in &[".md", ".markdown", ".txt"] {
                if let Err(e) = types_key.set_value(ext, &"") {
                    log::warn!("Failed to set SupportedTypes for {}: {}", ext, e);
                }
            }

            // Command
            let (cmd_key, _) = app_key
                .create_subkey(r"shell\open\command")
                .map_err(|e| e.to_string())?;
            cmd_key
                .set_value("", &format!("\"{}\" \"%1\"", exe_str))
                .map_err(|e| e.to_string())?;
        }

        // 3. Register in global OpenWithList to encourage "Open With" submenu presence
        // HKCU\Software\Classes\*\OpenWithList\markdown-rs.exe
        {
            let path = format!(r"Software\Classes\*\OpenWithList\{}", exe_name);
            if let Err(e) = hkcu.create_subkey(path) {
                log::warn!("Failed to create OpenWithList entry: {}", e);
            }
        }

        // 4. File-specific association hints
        {
            for ext in &[".md", ".markdown", ".txt"] {
                let path = format!(r"Software\Classes\{}\OpenWithList\{}", ext, exe_name);
                if let Err(e) = hkcu.create_subkey(path) {
                    log::warn!("Failed to create OpenWithList for {}: {}", ext, e);
                }
            }
        }

        // 5. Register "Edit" verb for Markdown files (Primary handler registration)
        {
            for ext in &[".md", ".markdown"] {
                let path = format!(r"Software\Classes\{}\shell\Edit", ext);
                let (key, _) = hkcu.create_subkey(&path).map_err(|e| e.to_string())?;

                if let Err(e) = key.set_value("", &"Edit with MarkdownRS") {
                    log::warn!("Failed to set Edit verb label for {}: {}", ext, e);
                }
                if let Err(e) = key.set_value("Icon", &exe_str) {
                    log::warn!("Failed to set Edit verb icon for {}: {}", ext, e);
                }

                let (cmd_key, _) = key.create_subkey("command").map_err(|e| e.to_string())?;
                cmd_key
                    .set_value("", &format!("\"{}\" \"%1\"", exe_str))
                    .map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    }

    pub fn remove_context_menu() -> Result<(), String> {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_name = exe_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("markdown-rs.exe");

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let mut errors = Vec::new();

        // Helper closure to delete subkey with error tracking
        let mut delete_with_tracking = |path: &str, description: &str| {
            if let Err(e) = hkcu.delete_subkey_all(path) {
                // Check if the key simply doesn't exist (not a real error)
                let error_str = e.to_string();
                if !error_str.contains("not found") && !error_str.contains("2") {
                    log::warn!(
                        "Failed to delete registry key '{}': {} - {}",
                        path,
                        description,
                        e
                    );
                    errors.push(format!("{}: {}", description, e));
                }
            } else {
                log::debug!(
                    "Successfully deleted registry key: {} - {}",
                    path,
                    description
                );
            }
        };

        // Remove Classic Context Menu
        delete_with_tracking(
            r"Software\Classes\*\shell\MarkdownRS",
            "Classic context menu",
        );

        // Remove Application Registration
        let app_path = format!(r"Software\Classes\Applications\{}", exe_name);
        delete_with_tracking(&app_path, "Application registration");

        // Remove OpenWithList Global
        let list_path = format!(r"Software\Classes\*\OpenWithList\{}", exe_name);
        delete_with_tracking(&list_path, "Global OpenWithList");

        // Remove Ext specific associations and Edit verbs
        for ext in &[".md", ".markdown", ".txt"] {
            let ext_list_path = format!(r"Software\Classes\{}\OpenWithList\{}", ext, exe_name);
            delete_with_tracking(&ext_list_path, &format!("OpenWithList for {}", ext));

            if *ext != ".txt" {
                let edit_path = format!(r"Software\Classes\{}\shell\Edit", ext);
                delete_with_tracking(&edit_path, &format!("Edit verb for {}", ext));
            }
        }

        // Check if critical keys were removed
        let critical_key = r"Software\Classes\*\shell\MarkdownRS";
        let critical_removed = hkcu.open_subkey(critical_key).is_err();

        if !errors.is_empty() {
            log::warn!(
                "Registry cleanup completed with {} error(s): {:?}",
                errors.len(),
                errors
            );

            // Return error only if critical key still exists
            if !critical_removed {
                return Err(format!(
                    "Failed to remove critical context menu registry entries. Errors: {}",
                    errors.join("; ")
                ));
            }

            // Best effort: return success if critical key was removed
            log::info!("Registry cleanup completed with non-critical errors (best effort mode)");
        } else {
            log::info!("Registry cleanup completed successfully");
        }

        Ok(())
    }

    pub fn check_context_menu() -> bool {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = r"Software\Classes\*\shell\MarkdownRS";
        hkcu.open_subkey(path).is_ok()
    }
}

#[tauri::command]
pub async fn set_context_menu_item(enable: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if enable {
            windows_registry::set_context_menu()
        } else {
            windows_registry::remove_context_menu()
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Context menu integration is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub async fn check_context_menu_status() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(windows_registry::check_context_menu())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}
