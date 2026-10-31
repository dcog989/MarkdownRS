include!(concat!(env!("OUT_DIR"), "/generated_themes.rs"));

/// Written synchronously so `list_files` can never see a partially seeded
/// directory during the first seconds of a launch.
pub fn seed_default_themes(themes_dir: &std::path::Path) {
    for (name, css) in TEMPLATE_THEMES {
        let theme_path = themes_dir.join(format!("{}.css", name));
        if theme_path.exists() {
            continue;
        }
        if let Err(e) = std::fs::write(&theme_path, css) {
            log::warn!("Failed to write theme '{}': {}", name, e);
        }
    }
}
