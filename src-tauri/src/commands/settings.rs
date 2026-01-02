use serde::Serialize;
use std::fs;
use tauri::Manager;
use unicode_bom::Bom;

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub install_path: String,
    pub data_path: String,
    pub cache_path: String,
    pub logs_path: String,
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
