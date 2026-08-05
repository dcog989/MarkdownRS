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

const SHARED_EDITOR_CSS: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/styles/themes/_editor.css"
));

pub fn wrap_theme_css(css: &str) -> String {
    let mut result = String::with_capacity(SHARED_EDITOR_CSS.len() + css.len() + 2);
    result.push_str(SHARED_EDITOR_CSS);
    result.push('\n');
    result.push('\n');
    result.push_str(css);
    result
}

fn keyed(name: &str) -> String {
    name.trim().to_lowercase().replace(' ', "-")
}

pub fn default_css(theme: &str) -> Option<&'static str> {
    crate::themes::lookup_template_css(&keyed(theme))
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

    let theme_path = {
        let exact = themes_dir.join(format!("{}.css", theme_name));
        if fs::try_exists(&exact).await.unwrap_or(false) {
            exact
        } else {
            let keyed_path = themes_dir.join(format!("{}.css", keyed(theme_name)));
            if fs::try_exists(&keyed_path).await.unwrap_or(false) {
                keyed_path
            } else {
                log::warn!("Theme '{}' not found", theme_name);
                return Err(format!("Custom theme '{}' not found", theme_name));
            }
        }
    };

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
