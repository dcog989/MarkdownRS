use std::path::{Path, PathBuf};
use tauri::Manager;

const CUSTOM_SPELLING_DIC_FILE: &str = "custom-spelling.dic";
const THEMES_DIR: &str = "Themes";

pub fn app_config_dir(app: &tauri::AppHandle) -> tauri::Result<PathBuf> {
    app.path().app_config_dir()
}

pub fn app_data_dir(app: &tauri::AppHandle) -> tauri::Result<PathBuf> {
    app.path().app_local_data_dir()
}

pub fn custom_dict_path(data_dir: &Path) -> PathBuf {
    data_dir.join(CUSTOM_SPELLING_DIC_FILE)
}

pub fn themes_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(THEMES_DIR)
}
