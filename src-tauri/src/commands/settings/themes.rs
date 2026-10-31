use crate::utils::handle_error;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::SystemTime;
use tokio::fs;
use tokio::sync::Mutex;

struct CachedTheme {
    css: String,
    mtime: SystemTime,
}

/// Upper bound on cached themes; the cache is cleared when exceeded so entries
/// for deleted/renamed themes never linger indefinitely.
const MAX_CACHED_THEMES: usize = 32;

static THEME_CACHE: LazyLock<Mutex<HashMap<String, CachedTheme>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn keyed(name: &str) -> String {
    name.trim().to_lowercase().replace(' ', "-")
}

/// A theme name must be a plain file stem. Names with a path separator or a
/// parent segment are rejected so `get_theme_css` cannot read outside the
/// themes directory (a name comes from settings.toml or the theme picker).
fn is_plain_name(name: &str) -> bool {
    Path::new(name).file_name().is_some_and(|n| n.to_str() == Some(name))
}

pub fn default_css(theme: &str) -> Option<&'static str> {
    crate::themes::lookup_template_css(&keyed(theme))
}

pub async fn list_files(app_handle: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let themes_dir = crate::utils::themes_dir(&super::app_data_path(app_handle)?);

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

/// CSS for a theme, or `None` when no file and no bundled template match.
/// A bundled name always wins, so shipped theme fixes reach existing installs;
/// custom themes are new file names.
pub async fn resolve_css(themes_dir: &Path, theme_name: &str) -> Option<String> {
    if let Some(css) = default_css(theme_name) {
        return Some(css.to_string());
    }
    read_css_file(resolve_path(themes_dir, theme_name).await?).await.ok()
}

/// CSS for the theme saved in settings. Silent on a miss: the built-in theme
/// has no CSS file.
pub async fn startup_css(app_handle: &tauri::AppHandle, theme_name: &str) -> Option<String> {
    let data_dir = super::app_data_path(app_handle).ok()?;
    resolve_css(&crate::utils::themes_dir(&data_dir), theme_name).await
}

async fn resolve_path(themes_dir: &Path, theme_name: &str) -> Option<PathBuf> {
    let keyed_name = keyed(theme_name);
    if !is_plain_name(theme_name) || !is_plain_name(&keyed_name) {
        // Expected for the built-in "Auto (Light/Dark)" pseudo-theme, which has
        // no CSS file: only a plain file stem can name one on disk.
        log::debug!(
            "Theme name is not a file name, using the built-in palette: {:?}",
            theme_name
        );
        return None;
    }

    let exact = themes_dir.join(format!("{}.css", theme_name));
    if fs::try_exists(&exact).await.unwrap_or(false) {
        return Some(exact);
    }
    let keyed_path = themes_dir.join(format!("{}.css", keyed_name));
    fs::try_exists(&keyed_path).await.unwrap_or(false).then_some(keyed_path)
}

async fn read_css_file(theme_path: PathBuf) -> Result<String, String> {
    // Key the cache by the resolved file path, not the request's display name,
    // so different spellings of the same theme share a single entry.
    let cache_key = theme_path.to_string_lossy().into_owned();

    let metadata = fs::metadata(&theme_path)
        .await
        .map_err(|e| handle_error(Some(&theme_path.to_string_lossy()), "read theme metadata", e))?;
    let file_mtime = metadata
        .modified()
        .map_err(|e| handle_error(Some(&theme_path.to_string_lossy()), "get file mtime", e))?;

    {
        let cache = THEME_CACHE.lock().await;
        if let Some(cached) = cache.get(&cache_key)
            && cached.mtime == file_mtime
        {
            return Ok(cached.css.clone());
        }
    }

    let css = fs::read_to_string(&theme_path)
        .await
        .map_err(|e| handle_error(Some(&theme_path.to_string_lossy()), "read theme", e))?;

    let mut cache = THEME_CACHE.lock().await;
    if cache.len() >= MAX_CACHED_THEMES && !cache.contains_key(&cache_key) {
        cache.clear();
    }
    cache.insert(
        cache_key,
        CachedTheme {
            css: css.clone(),
            mtime: file_mtime,
        },
    );

    Ok(css)
}

#[cfg(test)]
mod tests {
    use super::{default_css, is_plain_name, resolve_css};

    fn test_dir(suffix: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("markdownrs-theme-test-{suffix}-{}", std::process::id()))
    }

    #[tokio::test]
    async fn bundled_template_wins_over_stale_file() {
        let dir = test_dir("stale");
        tokio::fs::create_dir_all(&dir).await.unwrap();
        tokio::fs::write(dir.join("catppuccin.css"), ":root { --editor-bg: #123456; }")
            .await
            .unwrap();

        let css = resolve_css(&dir, "Catppuccin").await.unwrap();

        assert_eq!(css, default_css("Catppuccin").unwrap());
        tokio::fs::remove_dir_all(&dir).await.ok();
    }

    #[tokio::test]
    async fn custom_theme_file_is_used() {
        let dir = test_dir("custom");
        tokio::fs::create_dir_all(&dir).await.unwrap();
        tokio::fs::write(dir.join("my-theme.css"), ":root { --editor-bg: #123456; }")
            .await
            .unwrap();

        assert_eq!(
            resolve_css(&dir, "My Theme").await.unwrap(),
            ":root { --editor-bg: #123456; }"
        );
        assert_eq!(resolve_css(&dir, "Not A Theme").await, None);
        tokio::fs::remove_dir_all(&dir).await.ok();
    }

    #[test]
    fn rejects_names_with_path_components() {
        for name in ["", ".", "..", "../x", "../../etc/passwd", "a/b", "/abs"] {
            assert!(!is_plain_name(name), "{name:?} should be rejected");
        }
    }

    #[test]
    fn accepts_plain_theme_names() {
        for name in ["tokyo-night", "My Theme", "gruvbox"] {
            assert!(is_plain_name(name), "{name:?} should be accepted");
        }
    }

    #[cfg(windows)]
    #[test]
    fn rejects_windows_separators_and_prefixes() {
        for name in ["a\\b", "C:theme"] {
            assert!(!is_plain_name(name), "{name:?} should be rejected");
        }
    }
}
