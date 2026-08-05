use crate::utils;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use tauri::Manager;

pub struct AppPaths {
    pub local_dir: PathBuf,
    pub config_dir: PathBuf,
    pub db_dir: PathBuf,
    pub log_dir: PathBuf,
    pub themes_dir: PathBuf,
    pub config_path: PathBuf,
    pub dict_path: PathBuf,
}

pub fn resolve_app_paths(
    app_handle: &tauri::AppHandle,
) -> Result<AppPaths, Box<dyn std::error::Error>> {
    let local_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get local data dir: {}", e))?;
    let config_dir = utils::app_config_dir(app_handle)
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    Ok(AppPaths {
        db_dir: config_dir.join("Database"),
        log_dir: local_dir.join("Logs"),
        themes_dir: config_dir.join("Themes"),
        config_path: config_dir.join("settings.toml"),
        dict_path: utils::custom_dict_path(&config_dir),
        local_dir,
        config_dir,
    })
}

pub fn ensure_directories(paths: &AppPaths) {
    for dir in [
        &paths.local_dir,
        &paths.config_dir,
        &paths.db_dir,
        &paths.log_dir,
        &paths.themes_dir,
    ] {
        if let Err(e) = fs::create_dir_all(dir) {
            log::warn!("Failed to create directory {:?}: {}", dir, e);
        }
    }
}

pub fn schedule_temp_cleanup(local_dir: PathBuf, config_dir: PathBuf) {
    tauri::async_runtime::spawn(async move {
        let one_hour = std::time::Duration::from_secs(3600);
        if let Err(e) = utils::cleanup_stale_temp_files(&local_dir, one_hour).await {
            log::warn!("Failed to cleanup temp files in local dir: {}", e);
        }
        if let Err(e) = utils::cleanup_stale_temp_files(&config_dir, one_hour).await {
            log::warn!("Failed to cleanup temp files in config dir: {}", e);
        }
    });
}

pub fn ensure_dictionary_file(dict_path: &Path) {
    if !dict_path.exists()
        && let Err(e) = fs::write(dict_path, "")
    {
        log::warn!("Failed to create custom dictionary file: {}", e);
    }
}
