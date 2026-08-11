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
    crate::utils::app_config_dir(app).map_err(|e| handle_error(None, "get app config directory", e))
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
    let css = if let Some(css) = themes::default_css(&theme_name) {
        css.to_string()
    } else {
        themes::read_css(&app_handle, &theme_name).await?
    };
    Ok(themes::wrap_theme_css(&css))
}

#[tauri::command]
pub async fn load_settings(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let content = match io::read_settings_file(&app_handle).await? {
        Some(c) => c,
        None => return Ok(serde_json::json!({})),
    };

    let toml_val: toml::Value =
        toml::from_str(&content).map_err(|e| handle_error(None, "parse settings TOML", e))?;

    let json_val = serde_json::to_value(toml_val)
        .map_err(|e| handle_error(None, "convert settings to JSON", e))?;

    if let Some(state) = app_handle.try_state::<AppState>() {
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

    let max_size_received = settings.get(io::MAX_FILE_SIZE_KEY).cloned();
    log::info!(
        "save_settings called with maxFileSizeMB: {:?}",
        max_size_received
    );

    let mut settings = settings;
    io::normalize_max_file_size(&mut settings);

    // Carry backend-managed keys (e.g. `workspaceRoot`) across the full-state
    // save and prune any other key the frontend snapshot no longer contains.
    let preserved = io::preserved_settings_from_path(&path).await?;
    if let Some(table) = preserved.as_table() {
        for (key, value) in table {
            if settings.get(key).is_none() {
                let value = serde_json::to_value(value)
                    .map_err(|e| handle_error(None, "convert preserved settings to JSON", e))?;
                settings[key] = value;
            }
        }
    }

    io::write_settings_file(&path, &settings).await?;

    if let Some(state) = app_handle.try_state::<AppState>() {
        state
            .max_file_size_bytes
            .store(MAX_FILE_SIZE_UNSET, Ordering::Relaxed);

        let mut pr = state.project_root.lock_or_recover();
        *pr = settings
            .get("workspaceRoot")
            .and_then(|v| v.as_str())
            .map(PathBuf::from);
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
