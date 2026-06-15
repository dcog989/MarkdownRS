use std::fs;
use std::path::Path;

/// One-time migration: move data from the old bare "MarkdownRS" identifier path
/// to the new reverse-DNS "com.markdownrs.app" path used by Tauri on Linux.
/// Safe to call repeatedly — does nothing if already migrated or not on Linux.
#[cfg(target_os = "linux")]
pub fn migrate_data_dir_if_needed() {
    use std::path::PathBuf;
    let Some(base) = dirs::data_dir() else { return };
    let new_path: PathBuf = base.join("com.markdownrs.editor");
    if new_path.exists() {
        return;
    }
    for old_name in ["MarkdownRS", "com.markdownrs.app"] {
        let old_path = base.join(old_name);
        if old_path.exists() {
            match fs::rename(&old_path, &new_path) {
                Ok(_) => eprintln!("[INFO] Migrated app data: {:?} -> {:?}", old_path, new_path),
                Err(e) => eprintln!("[WARN] Data migration failed: {}", e),
            }
            return;
        }
    }
}

#[cfg(not(target_os = "linux"))]
pub fn migrate_data_dir_if_needed() {}

/// Migrate persistent data from old `.local/share` to `.config`.
pub fn migrate_to_config(local_dir: &Path, config_dir: &Path) {
    for (old, new) in [
        (
            local_dir.join("settings.toml"),
            config_dir.join("settings.toml"),
        ),
        (
            local_dir.join("custom-spelling.dic"),
            config_dir.join("custom-spelling.dic"),
        ),
        (local_dir.join("Database"), config_dir.join("Database")),
        (local_dir.join("Themes"), config_dir.join("Themes")),
    ] {
        if old.exists()
            && !new.exists()
            && let Err(e) = fs::rename(&old, &new)
        {
            log::warn!("Failed to migrate {:?} to {:?}: {}", old, new, e);
        }
    }
}
