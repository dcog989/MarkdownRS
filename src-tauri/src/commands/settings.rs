use encoding_rs::{UTF_16BE, UTF_16LE};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::sync::LazyLock;
use tauri::Manager;
use tokio::sync::Mutex;
use unicode_bom::Bom;

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
    let app_dir = app_handle.path().app_data_dir().map_err(|e| {
        log::error!("Failed to get app data directory for themes: {}", e);
        format!("Failed to access themes: {}", e)
    })?;
    let themes_dir = app_dir.join("Themes");

    let mut themes = Vec::new();
    if let Ok(entries) = fs::read_dir(themes_dir) {
        log::debug!("Scanning themes directory");
        for entry in entries.flatten() {
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

    let css = fs::read_to_string(theme_path).map_err(|e| {
        log::error!("Failed to read theme '{}': {}", theme_name, e);
        format!("Failed to load theme: {}", e)
    })?;

    let mut cache = THEME_CACHE.lock().await;
    cache.insert(theme_name, css.clone());

    Ok(css)
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

    let content = match Bom::from(raw_bytes.as_slice()) {
        Bom::Null => String::from_utf8_lossy(&raw_bytes).to_string(),
        Bom::Utf8 => String::from_utf8_lossy(&raw_bytes[3..]).to_string(),
        Bom::Utf16Le => {
            let (decoded, _, had_errors) = UTF_16LE.decode(&raw_bytes[2..]);
            if had_errors {
                log::warn!("UTF-16LE decoding encountered errors in settings file");
            }
            decoded.to_string()
        }
        Bom::Utf16Be => {
            let (decoded, _, had_errors) = UTF_16BE.decode(&raw_bytes[2..]);
            if had_errors {
                log::warn!("UTF-16BE decoding encountered errors in settings file");
            }
            decoded.to_string()
        }
        bom => {
            log::warn!(
                "Exotic BOM type {:?} detected in settings file, falling back to UTF-8",
                bom
            );
            String::from_utf8_lossy(&raw_bytes[bom.len()..]).to_string()
        }
    };

    let toml_val: toml::Value = toml::from_str(&content).map_err(|e| {
        log::error!("Failed to parse settings TOML: {}", e);
        format!("Failed to parse settings: {}", e)
    })?;

    serde_json::to_value(toml_val).map_err(|e| {
        log::error!("Failed to convert settings to JSON: {}", e);
        format!("Failed to process settings: {}", e)
    })
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

            // "FriendlyAppName" is what shows up in the Open With menu
            app_key.set_value("FriendlyAppName", &"MarkdownRS").ok();

            // "SupportedTypes" helps Windows know this app handles these files
            let (types_key, _) = app_key
                .create_subkey("SupportedTypes")
                .map_err(|e| e.to_string())?;
            types_key.set_value(".md", &"").ok();
            types_key.set_value(".markdown", &"").ok();
            types_key.set_value(".txt", &"").ok();

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
            let _ = hkcu.create_subkey(path).map_err(|e| e.to_string())?;
        }

        // 4. File-specific association hints
        {
            for ext in &[".md", ".markdown", ".txt"] {
                let path = format!(r"Software\Classes\{}\OpenWithList\{}", ext, exe_name);
                let _ = hkcu.create_subkey(path).ok();
            }
        }

        // 5. Register "Edit" verb for Markdown files (Primary handler registration)
        {
            for ext in &[".md", ".markdown"] {
                let path = format!(r"Software\Classes\{}\shell\Edit", ext);
                let (key, _) = hkcu.create_subkey(&path).map_err(|e| e.to_string())?;

                key.set_value("", &"Edit with MarkdownRS").ok();
                key.set_value("Icon", &exe_str).ok();

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

        // Remove Classic
        let _ = hkcu.delete_subkey_all(r"Software\Classes\*\shell\MarkdownRS");

        // Remove Application Registration
        let app_path = format!(r"Software\Classes\Applications\{}", exe_name);
        let _ = hkcu.delete_subkey_all(&app_path);

        // Remove OpenWithList Global
        let list_path = format!(r"Software\Classes\*\OpenWithList\{}", exe_name);
        let _ = hkcu.delete_subkey_all(&list_path);

        // Remove Ext specific associations and Edit verbs
        for ext in &[".md", ".markdown", ".txt"] {
            let list_path = format!(r"Software\Classes\{}\OpenWithList\{}", ext, exe_name);
            let _ = hkcu.delete_subkey_all(&list_path);

            if *ext != ".txt" {
                let edit_path = format!(r"Software\Classes\{}\shell\Edit", ext);
                let _ = hkcu.delete_subkey_all(&edit_path);
            }
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
