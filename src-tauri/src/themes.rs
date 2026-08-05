include!(concat!(env!("OUT_DIR"), "/generated_themes.rs"));

pub fn seed_default_themes(themes_dir: std::path::PathBuf) {
    tauri::async_runtime::spawn(async move {
        for (name, css) in TEMPLATE_THEMES {
            let theme_path = themes_dir.join(format!("{}.css", name));
            if tokio::fs::try_exists(&theme_path).await.unwrap_or(false) {
                continue;
            }
            if let Err(e) = tokio::fs::write(&theme_path, css).await {
                log::warn!("Failed to write theme '{}': {}", name, e);
            }
        }
    });
}
