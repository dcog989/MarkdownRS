use crate::state::{AppState, MAX_FILE_SIZE_UNSET};
use crate::utils::{handle_error, read_text_with_bom_detection};
use std::sync::atomic::Ordering;
use tauri::Manager;
use tokio::fs;

pub(super) const MAX_FILE_SIZE_KEY: &str = "maxFileSizeMB";

const DEFAULT_MAX_FILE_SIZE_MB: u64 = 50;
const MAX_FILE_SIZE_MIN_MB: u64 = 1;
const MAX_FILE_SIZE_MAX_MB: u64 = 500;
const DEFAULT_MAX_FILE_SIZE_BYTES: u64 = DEFAULT_MAX_FILE_SIZE_MB * 1024 * 1024;

pub(super) fn max_file_size_mb_to_bytes(mb: u64) -> u64 {
    mb.clamp(MAX_FILE_SIZE_MIN_MB, MAX_FILE_SIZE_MAX_MB) * 1024 * 1024
}

pub(super) fn normalize_max_file_size(settings: &mut serde_json::Value) {
    let mb = settings
        .get(MAX_FILE_SIZE_KEY)
        .and_then(|v| v.as_u64())
        .map(|v| v.clamp(MAX_FILE_SIZE_MIN_MB, MAX_FILE_SIZE_MAX_MB))
        .unwrap_or(DEFAULT_MAX_FILE_SIZE_MB);
    settings[MAX_FILE_SIZE_KEY] = serde_json::json!(mb);
}

pub fn read_and_parse_sync(path: &std::path::Path) -> Result<toml::Value, String> {
    let raw_bytes = std::fs::read(path)
        .map_err(|e| handle_error(Some(&path.to_string_lossy()), "read settings file", e))?;
    let content = read_text_with_bom_detection(raw_bytes);
    toml::from_str(&content).map_err(|e| handle_error(None, "parse settings TOML", e))
}

pub async fn read_settings_file(app_handle: &tauri::AppHandle) -> Result<Option<String>, String> {
    let config_dir = super::app_config_path(app_handle)?;
    let path = config_dir.join("settings.toml");

    let raw_bytes = match fs::read(&path).await {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => {
            return Err(handle_error(
                Some(&path.to_string_lossy()),
                "read settings file",
                e,
            ));
        },
    };

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
                .get(MAX_FILE_SIZE_KEY)
                .and_then(|v| v.as_integer())
                .unwrap_or(DEFAULT_MAX_FILE_SIZE_MB as i64) as u64;
            max_file_size_mb_to_bytes(mb)
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
