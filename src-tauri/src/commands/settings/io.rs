use crate::state::{AppState, MAX_FILE_SIZE_UNSET};
use crate::utils::{handle_error, read_text_with_bom_detection};
use std::sync::atomic::Ordering;
use tauri::Manager;
use tokio::fs;

const DEFAULT_MAX_FILE_SIZE_BYTES: u64 = 50 * 1024 * 1024;

pub async fn read_settings_file(app_handle: &tauri::AppHandle) -> Result<Option<String>, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| handle_error(None, "get app config directory for load_settings", e))?;
    let path = config_dir.join("settings.toml");

    match fs::try_exists(&path).await {
        Ok(false) | Err(_) => return Ok(None),
        Ok(true) => {},
    }

    let raw_bytes = fs::read(&path)
        .await
        .map_err(|e| handle_error(Some(&path.to_string_lossy()), "read settings file", e))?;

    Ok(Some(read_text_with_bom_detection(raw_bytes)))
}

async fn load_settings_toml(app_handle: &tauri::AppHandle) -> Result<toml::Value, String> {
    let content = match read_settings_file(app_handle).await? {
        Some(c) => c,
        None => return Ok(toml::Value::Table(toml::map::Map::new())),
    };

    toml::from_str(&content).map_err(|e| handle_error(None, "parse settings TOML", e))
}

async fn load_max_file_size_from_disk(app_handle: &tauri::AppHandle) -> u64 {
    match load_settings_toml(app_handle).await {
        Ok(toml_val) => {
            let mb = toml_val
                .get("maxFileSizeMB")
                .or_else(|| toml_val.get("max_file_size_mb"))
                .and_then(|v| v.as_integer())
                .unwrap_or(50);
            (mb as u64).clamp(1, 500) * 1024 * 1024
        },
        Err(_) => DEFAULT_MAX_FILE_SIZE_BYTES,
    }
}

pub async fn get_max_file_size_bytes(app_handle: &tauri::AppHandle) -> u64 {
    if let Some(state) = app_handle.try_state::<AppState>() {
        let cached = state.max_file_size_bytes.load(Ordering::Relaxed);
        if cached != MAX_FILE_SIZE_UNSET {
            return cached;
        }
        let value = load_max_file_size_from_disk(app_handle).await;
        state.max_file_size_bytes.store(value, Ordering::Relaxed);
        value
    } else {
        load_max_file_size_from_disk(app_handle).await
    }
}

pub async fn write_settings_file(
    path: &std::path::Path,
    settings: &serde_json::Value,
) -> Result<(), String> {
    let toml_str = toml::to_string_pretty(settings)
        .map_err(|e| handle_error(None, "serialize settings to TOML", e))?;
    fs::write(path, toml_str)
        .await
        .map_err(|e| handle_error(Some(&path.to_string_lossy()), "write settings file", e))?;
    log::info!("Settings saved successfully to {:?}", path);
    Ok(())
}
