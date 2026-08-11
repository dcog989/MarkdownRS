use crate::state::{AppState, MAX_FILE_SIZE_UNSET};
use crate::utils::{handle_error, read_text_with_bom_detection};
use std::sync::atomic::Ordering;
use tauri::Manager;
use tokio::fs;

pub(super) const MAX_FILE_SIZE_KEY: &str = "maxFileSizeMB";

/// Keys the backend manages that the frontend snapshot does not include
/// (e.g. `workspaceRoot`). They are carried across full-state saves so they
/// are neither lost nor treated as stale. Any other key absent from the
/// incoming snapshot is pruned from the file on save.
const PRESERVED_SETTINGS_KEYS: &[&str] = &["workspaceRoot"];

const DEFAULT_MAX_FILE_SIZE_MB: u64 = 20;
const MAX_FILE_SIZE_MIN_MB: u64 = 4;
const MAX_FILE_SIZE_MAX_MB: u64 = 50;
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

/// Extracts the backend-managed keys (e.g. `workspaceRoot`) from the existing
/// settings file so they survive a full-state save. The frontend snapshot never
/// contains them; without this they would be pruned along with genuinely stale
/// keys. Returns an empty table when the file does not exist yet.
pub async fn preserved_settings_from_path(path: &std::path::Path) -> Result<toml::Value, String> {
    let raw_bytes = match fs::read(path).await {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(toml::Value::Table(toml::map::Map::new()));
        },
        Err(e) => {
            return Err(handle_error(
                Some(&path.to_string_lossy()),
                "read settings file",
                e,
            ));
        },
    };
    let content = read_text_with_bom_detection(raw_bytes);
    let toml_val: toml::Value =
        toml::from_str(&content).map_err(|e| handle_error(None, "parse settings TOML", e))?;

    let mut preserved = toml::map::Map::new();
    if let Some(table) = toml_val.as_table() {
        for key in PRESERVED_SETTINGS_KEYS {
            if let Some(value) = table.get(*key) {
                preserved.insert((*key).to_string(), value.clone());
            }
        }
    }
    Ok(toml::Value::Table(preserved))
}
