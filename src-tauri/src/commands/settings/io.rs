use crate::state::{AppState, MAX_FILE_SIZE_UNSET};
use crate::utils::{handle_error, parse_settings_toml, read_text_with_bom_detection};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::Manager;
use tokio::fs;

pub(super) const MAX_FILE_SIZE_KEY: &str = "maxFileSizeMB";
const SETTINGS_FILE_NAME: &str = "settings.toml";

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

pub(super) fn settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(super::app_config_path(app_handle)?.join(SETTINGS_FILE_NAME))
}

/// Moves an unparseable settings file aside so one hand-edit typo cannot block
/// every later save. The `.bak` copy keeps the user's edits recoverable.
pub(super) async fn quarantine_invalid(path: &Path, error: &str) -> Option<PathBuf> {
    let backup = path.with_extension("toml.bak");
    log::warn!(
        "Settings file {} is not valid TOML ({}); moving it to {}",
        path.display(),
        error,
        backup.display()
    );
    match fs::rename(path, &backup).await {
        Ok(()) => Some(backup),
        Err(e) => {
            log::warn!("Failed to move invalid settings file aside: {}", e);
            None
        },
    }
}

pub async fn read_settings_file(app_handle: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(app_handle)?;

    let raw_bytes = match fs::read(&path).await {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => {
            return Err(handle_error(Some(&path.to_string_lossy()), "read settings file", e));
        },
    };

    Ok(Some(read_text_with_bom_detection(raw_bytes)))
}

async fn load_settings_toml(app_handle: &tauri::AppHandle) -> Result<toml::Value, String> {
    let content = match read_settings_file(app_handle).await? {
        Some(c) => c,
        None => return Ok(toml::Value::Table(toml::map::Map::new())),
    };

    parse_settings_toml(&content)
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

pub async fn write_settings_file(path: &Path, settings: &serde_json::Value) -> Result<(), String> {
    let toml_str = toml::to_string_pretty(settings).map_err(|e| handle_error(None, "serialize settings to TOML", e))?;
    crate::utils::atomic_write(path, toml_str.as_bytes())
        .await
        .map_err(|e| handle_error(Some(&path.to_string_lossy()), "write settings file", e))?;
    log::debug!("Settings saved successfully to {:?}", path);
    Ok(())
}

/// Extracts the backend-managed keys (e.g. `workspaceRoot`) from the existing
/// settings file so they survive a full-state save. The frontend snapshot never
/// contains them; without this they would be pruned along with genuinely stale
/// keys. Returns an empty table when the file does not exist or cannot be
/// parsed — an invalid file is moved aside so the save can proceed.
pub async fn preserved_settings_from_path(path: &Path) -> Result<toml::Value, String> {
    let raw_bytes = match fs::read(path).await {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(toml::Value::Table(toml::map::Map::new()));
        },
        Err(e) => {
            return Err(handle_error(Some(&path.to_string_lossy()), "read settings file", e));
        },
    };
    let content = read_text_with_bom_detection(raw_bytes);
    let toml_val = match parse_settings_toml(&content) {
        Ok(toml_val) => toml_val,
        Err(e) => {
            quarantine_invalid(path, &e).await;
            return Ok(toml::Value::Table(toml::map::Map::new()));
        },
    };

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

#[cfg(test)]
mod tests {
    use super::{preserved_settings_from_path, quarantine_invalid};
    use crate::utils::test_util::make_temp_dir;
    use std::fs;

    #[tokio::test]
    async fn preserved_settings_keep_only_backend_managed_keys() {
        let dir = make_temp_dir("settings-preserved");
        let path = dir.join("settings.toml");
        fs::write(&path, "workspaceRoot = \"/work\"\nactiveTheme = \"nord\"\n").unwrap();

        let preserved = preserved_settings_from_path(&path).await.unwrap();

        assert_eq!(preserved.get("workspaceRoot").and_then(|v| v.as_str()), Some("/work"));
        assert!(
            preserved.get("activeTheme").is_none(),
            "frontend-owned keys must not be preserved"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn preserved_settings_are_empty_when_the_file_is_missing() {
        let dir = make_temp_dir("settings-preserved-missing");

        let preserved = preserved_settings_from_path(&dir.join("settings.toml")).await.unwrap();

        assert!(preserved.as_table().is_some_and(|table| table.is_empty()));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn invalid_settings_do_not_block_the_save() {
        let dir = make_temp_dir("settings-preserved-invalid");
        let path = dir.join("settings.toml");
        fs::write(&path, "workspaceRoot = [broken").unwrap();

        let preserved = preserved_settings_from_path(&path).await.unwrap();

        assert!(preserved.as_table().is_some_and(|table| table.is_empty()));
        assert!(!path.exists(), "the invalid file should be moved aside");
        assert!(dir.join("settings.toml.bak").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn quarantine_keeps_the_broken_file_next_to_the_target() {
        let dir = make_temp_dir("settings-quarantine");
        let path = dir.join("settings.toml");
        fs::write(&path, "maxFileSizeMB = [broken").unwrap();

        let backup = quarantine_invalid(&path, "parse error").await.expect("backup path");

        assert!(!path.exists());
        assert_eq!(backup, dir.join("settings.toml.bak"));
        assert_eq!(fs::read_to_string(&backup).unwrap(), "maxFileSizeMB = [broken");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn quarantine_does_nothing_when_the_file_is_gone() {
        let dir = make_temp_dir("settings-quarantine-missing");
        assert!(
            quarantine_invalid(&dir.join("settings.toml"), "parse error")
                .await
                .is_none()
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
