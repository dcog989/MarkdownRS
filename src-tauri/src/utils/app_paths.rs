use std::path::{Path, PathBuf};
use tauri::Manager;

const CUSTOM_SPELLING_DIC_FILE: &str = "custom-spelling.dic";

pub fn app_config_dir(app: &tauri::AppHandle) -> tauri::Result<PathBuf> {
    app.path().app_config_dir()
}

pub fn custom_dict_path(config_dir: &Path) -> PathBuf {
    config_dir.join(CUSTOM_SPELLING_DIC_FILE)
}
