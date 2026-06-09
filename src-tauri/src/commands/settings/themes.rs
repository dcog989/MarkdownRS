use crate::utils::handle_error;
use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::SystemTime;
use tokio::fs;
use tokio::sync::Mutex;

struct CachedTheme {
    css: String,
    mtime: SystemTime,
}

static THEME_CACHE: LazyLock<Mutex<HashMap<String, CachedTheme>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const DEFAULT_DARK_CSS: &str = include_str!("../../../templates/default-dark.css");
const DEFAULT_LIGHT_CSS: &str = include_str!("../../../templates/default-light.css");

pub fn default_css(theme: &str) -> Option<&'static str> {
    match theme {
        "RS-Dark" | "default-dark" => Some(DEFAULT_DARK_CSS),
        "RS-Light" | "default-light" => Some(DEFAULT_LIGHT_CSS),
        _ => None,
    }
}

pub async fn list_files(app_handle: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let config_dir = super::app_config_path(app_handle)?;
    let themes_dir = config_dir.join("Themes");

    let mut themes = Vec::new();
    match fs::read_dir(&themes_dir).await {
        Ok(mut entries) => {
            log::debug!("Scanning themes directory");
            while let Some(entry) = entries.next_entry().await.transpose() {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if let Some(name) = path
                        .extension()
                        .filter(|&s| s == "css")
                        .and_then(|_| path.file_stem())
                        .and_then(|s| s.to_str())
                    {
                        themes.push(name.to_string());
                    }
                }
            }
        },
        Err(e) => {
            log::debug!("Themes directory not accessible: {}", e);
        },
    }
    Ok(themes)
}

pub async fn read_css(app_handle: &tauri::AppHandle, theme_name: &str) -> Result<String, String> {
    let config_dir = super::app_config_path(app_handle)?;
    let themes_dir = config_dir.join("Themes");
    let theme_path = themes_dir.join(format!("{}.css", theme_name));

    match fs::try_exists(&theme_path).await {
        Ok(false) | Err(_) => {
            log::warn!("Theme '{}' not found at path: {:?}", theme_name, theme_path);
            return Err(format!("Custom theme '{}' not found", theme_name));
        },
        Ok(true) => {},
    }

    let metadata = fs::metadata(&theme_path).await.map_err(|e| {
        handle_error(
            Some(&theme_path.to_string_lossy()),
            "read theme metadata",
            e,
        )
    })?;
    let file_mtime = metadata
        .modified()
        .map_err(|e| handle_error(Some(&theme_path.to_string_lossy()), "get file mtime", e))?;

    {
        let cache = THEME_CACHE.lock().await;
        if let Some(cached) = cache.get(theme_name)
            && cached.mtime == file_mtime
        {
            return Ok(cached.css.clone());
        }
    }

    let css = fs::read_to_string(&theme_path)
        .await
        .map_err(|e| handle_error(Some(&theme_path.to_string_lossy()), "read theme", e))?;

    let mut cache = THEME_CACHE.lock().await;
    cache.insert(
        theme_name.to_string(),
        CachedTheme {
            css: css.clone(),
            mtime: file_mtime,
        },
    );

    Ok(css)
}
