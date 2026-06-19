pub mod app_info;
pub mod io;
pub mod themes;

pub use app_info::AppInfo;
pub use io::get_max_file_size_bytes;

use crate::state::{AppState, MAX_FILE_SIZE_UNSET};
use crate::utils::{MutexExt, handle_error};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::Manager;

pub(super) fn app_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| handle_error(None, "get app config directory", e))
}

#[tauri::command]
pub async fn get_app_info(app_handle: tauri::AppHandle) -> Result<AppInfo, String> {
    Ok(app_info::collect(&app_handle))
}

#[tauri::command]
pub async fn get_available_themes(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    themes::list_files(&app_handle).await
}

#[tauri::command]
pub async fn get_theme_css(
    app_handle: tauri::AppHandle,
    theme_name: String,
) -> Result<String, String> {
    if let Some(css) = themes::default_css(&theme_name) {
        return Ok(css.to_string());
    }
    themes::read_css(&app_handle, &theme_name).await
}

#[tauri::command]
pub async fn load_settings(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    if let Some(state) = app_handle.try_state::<AppState>() {
        let cache = state.settings_cache.lock_or_recover();
        if let Some(ref cached) = *cache {
            return Ok(cached.clone());
        }
    }

    let content = match io::read_settings_file(&app_handle).await? {
        Some(c) => c,
        None => return Ok(serde_json::json!({})),
    };

    let toml_val: toml::Value =
        toml::from_str(&content).map_err(|e| handle_error(None, "parse settings TOML", e))?;

    let json_val = serde_json::to_value(toml_val)
        .map_err(|e| handle_error(None, "convert settings to JSON", e))?;

    if let Some(state) = app_handle.try_state::<AppState>() {
        let mut cache = state.settings_cache.lock_or_recover();
        *cache = Some(json_val.clone());

        let mut pr = state.project_root.lock_or_recover();
        *pr = json_val
            .get("workspaceRoot")
            .and_then(|v| v.as_str())
            .map(PathBuf::from);
    }

    Ok(json_val)
}

#[tauri::command]
pub async fn save_settings(
    app_handle: tauri::AppHandle,
    settings: serde_json::Value,
) -> Result<(), String> {
    let config_dir = app_config_path(&app_handle)?;
    let path = config_dir.join("settings.toml");

    let max_size_received = settings
        .get(io::MAX_FILE_SIZE_KEY_CAMEL)
        .or_else(|| settings.get(io::MAX_FILE_SIZE_KEY_SNAKE))
        .cloned();
    log::info!(
        "save_settings called with maxFileSizeMB: {:?}",
        max_size_received
    );

    let mut settings = settings;
    io::normalize_max_file_size(&mut settings);

    io::write_settings_file(&path, &settings).await?;

    if let Some(state) = app_handle.try_state::<AppState>() {
        state
            .max_file_size_bytes
            .store(MAX_FILE_SIZE_UNSET, Ordering::Relaxed);
        let mut cache = state.settings_cache.lock_or_recover();
        *cache = None;
        let mut pr = state.project_root.lock_or_recover();
        *pr = None;
    }

    Ok(())
}

#[tauri::command]
pub async fn toggle_devtools(#[allow(unused_variables)] window: tauri::WebviewWindow) {
    #[cfg(debug_assertions)]
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}
