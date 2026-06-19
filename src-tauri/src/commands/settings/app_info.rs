use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

const LOGS_DIR: &str = "Logs";
const LOG_FILE_NAME: &str = "markdown-rs.log";

fn path_or_default(
    result: Result<PathBuf, impl std::fmt::Debug>,
    f: impl FnOnce(PathBuf) -> String,
) -> String {
    result.map(f).unwrap_or_default()
}

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub install_path: String,
    pub data_path: String,
    pub cache_path: String,
    pub logs_path: String,
    pub log_file_path: String,
    pub os_platform: String,
}

pub fn collect(app_handle: &tauri::AppHandle) -> AppInfo {
    let install_path = std::env::current_exe()
        .map(|p| {
            p.parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    let path = app_handle.path();
    let data_path = path_or_default(path.app_config_dir(), |p| p.to_string_lossy().to_string());
    let cache_path = path_or_default(path.app_local_data_dir(), |p| {
        p.to_string_lossy().to_string()
    });
    let logs_path = path_or_default(path.app_local_data_dir(), |p| {
        p.join(LOGS_DIR).to_string_lossy().to_string()
    });
    let log_file_path = path_or_default(path.app_local_data_dir(), |p| {
        p.join(LOGS_DIR)
            .join(LOG_FILE_NAME)
            .to_string_lossy()
            .to_string()
    });

    let os_platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
    .to_string();

    AppInfo {
        name: "MarkdownRS".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        install_path,
        data_path,
        cache_path,
        logs_path,
        log_file_path,
        os_platform,
    }
}
