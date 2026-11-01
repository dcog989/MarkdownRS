pub mod app_info;
pub mod io;
pub mod themes;

pub use app_info::AppInfo;
pub use io::get_max_file_size_bytes;

use crate::state::{AppState, MAX_FILE_SIZE_UNSET};
use crate::utils::{MutexExt, handle_error, parse_settings_toml};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::Manager;

pub(super) fn app_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    crate::utils::app_config_dir(app).map_err(|e| handle_error(None, "get app config directory", e))
}

pub(super) fn app_data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    crate::utils::app_data_dir(app).map_err(|e| handle_error(None, "get app data directory", e))
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
pub async fn get_theme_variants(app_handle: tauri::AppHandle) -> Result<HashMap<String, bool>, String> {
    themes::list_variants(&app_handle).await
}

#[tauri::command]
pub async fn get_theme_css(app_handle: tauri::AppHandle, theme_name: String) -> Result<String, String> {
    let data_dir = app_data_path(&app_handle)?;
    themes::resolve_css(&crate::utils::themes_dir(&data_dir), &theme_name)
        .await
        .ok_or_else(|| format!("Theme '{theme_name}' not found"))
}

/// Desktop accent colour as `#rrggbb`, empty when the platform has no readable
/// source. Only KDE keeps it in a file the app can read.
#[tauri::command]
pub async fn get_system_accent_color() -> Result<String, String> {
    Ok(system_accent_color())
}

#[cfg(target_os = "linux")]
fn system_accent_color() -> String {
    dirs::config_dir()
        .and_then(|dir| std::fs::read_to_string(dir.join("kdeglobals")).ok())
        .and_then(|content| parse_kde_accent(&content))
        .unwrap_or_default()
}

#[cfg(not(target_os = "linux"))]
fn system_accent_color() -> String {
    String::new()
}

/// Reads `AccentColor=r,g,b` from the `[General]` section of kdeglobals.
#[cfg(target_os = "linux")]
fn parse_kde_accent(kdeglobals: &str) -> Option<String> {
    let mut in_general = false;
    for line in kdeglobals.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_general = line == "[General]";
            continue;
        }
        if !in_general {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() != "AccentColor" {
            continue;
        }
        let channels = value
            .split(',')
            .map(|channel| channel.trim().parse::<u8>().ok())
            .collect::<Option<Vec<u8>>>()?;
        return match channels.as_slice() {
            // Plasma 6 writes RGB; tolerate a trailing alpha channel.
            [r, g, b, ..] => Some(format!("#{r:02x}{g:02x}{b:02x}")),
            _ => None,
        };
    }
    None
}

#[tauri::command]
pub async fn load_settings(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let content = match io::read_settings_file(&app_handle).await? {
        Some(c) => c,
        None => return Ok(serde_json::json!({})),
    };

    let toml_val = match parse_settings_toml(&content) {
        Ok(toml_val) => toml_val,
        Err(e) => {
            let path = io::settings_path(&app_handle)?;
            io::quarantine_invalid(&path, &e).await;
            return Err(e);
        },
    };

    let mut json_val = serde_json::to_value(toml_val).map_err(|e| handle_error(None, "convert settings to JSON", e))?;

    // The backend clamps this on read; clamp the copy the frontend checks
    // against too, so its "file too large" check matches the real limit.
    io::normalize_max_file_size(&mut json_val);

    if let Some(state) = app_handle.try_state::<AppState>() {
        let mut pr = state.project_root.lock_or_recover();
        *pr = json_val
            .get("workspaceRoot")
            .and_then(|v| v.as_str())
            .map(PathBuf::from);
    }

    // The active theme's CSS rides along so the first frame is themed; a second
    // request after paint would flash the built-in palette first.
    let theme_name = json_val
        .get("activeTheme")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    if !theme_name.is_empty()
        && let Some(css) = themes::startup_css(&app_handle, &theme_name).await
    {
        json_val["themeCss"] = serde_json::Value::String(css);
    }

    Ok(json_val)
}

#[tauri::command]
pub async fn save_settings(app_handle: tauri::AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let path = io::settings_path(&app_handle)?;

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
        state.max_file_size_bytes.store(MAX_FILE_SIZE_UNSET, Ordering::Relaxed);

        let mut pr = state.project_root.lock_or_recover();
        *pr = settings
            .get("workspaceRoot")
            .and_then(|v| v.as_str())
            .map(PathBuf::from);
    }

    Ok(())
}

#[tauri::command]
pub async fn set_log_level(level: String) -> Result<(), String> {
    crate::bootstrap::logging::apply_log_level(&level);
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

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::parse_kde_accent;

    #[test]
    fn parses_accent_from_the_general_section_only() {
        let kdeglobals =
            "[Colors:Window]\nAccentColor=1,2,3\n\n[General]\nColorSchemeHash=abc\nAccentColor=99,130,110\n";
        assert_eq!(parse_kde_accent(kdeglobals).as_deref(), Some("#63826e"));
    }

    #[test]
    fn rejects_missing_or_malformed_accent() {
        assert_eq!(parse_kde_accent("[General]\nColorSchemeHash=abc\n"), None);
        assert_eq!(parse_kde_accent("[General]\nAccentColor=99,130\n"), None);
        assert_eq!(parse_kde_accent("[General]\nAccentColor=99,130,999\n"), None);
    }
}
