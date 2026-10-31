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
    if destination_is_in_use(&new_path) {
        return;
    }
    for old_name in ["MarkdownRS", "com.markdownrs.app"] {
        let old_path = base.join(old_name);
        if !old_path.exists() {
            continue;
        }
        // An empty directory does not count as migrated, but it still blocks
        // the rename, so clear it first.
        if new_path.exists()
            && let Err(e) = fs::remove_dir(&new_path)
        {
            eprintln!("[WARN] Data migration failed, cannot clear {:?}: {}", new_path, e);
            return;
        }
        match fs::rename(&old_path, &new_path) {
            Ok(_) => eprintln!("[INFO] Migrated app data: {:?} -> {:?}", old_path, new_path),
            Err(e) => eprintln!("[WARN] Data migration failed: {}", e),
        }
        return;
    }
}

/// A destination holding any entry is a real data directory, not a
/// placeholder, so the one-time move must not run.
#[cfg(target_os = "linux")]
fn destination_is_in_use(path: &Path) -> bool {
    fs::read_dir(path).is_ok_and(|mut entries| entries.next().is_some())
}

#[cfg(not(target_os = "linux"))]
pub fn migrate_data_dir_if_needed() {}

/// Migrate settings from the old `.local/share` location to `.config`.
pub fn migrate_to_config(local_dir: &Path, config_dir: &Path) {
    let old = local_dir.join("settings.toml");
    let new = config_dir.join("settings.toml");
    if !old.exists() || new.exists() {
        return;
    }
    // The config directory is usually created later; a rename fails without it.
    if let Err(e) = fs::create_dir_all(config_dir) {
        log::warn!("Failed to create config directory {:?}: {}", config_dir, e);
        return;
    }
    if let Err(e) = fs::rename(&old, &new) {
        log::warn!("Failed to migrate {:?} to {:?}: {}", old, new, e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_util::make_temp_dir;

    #[test]
    fn migrate_to_config_creates_the_target_directory() {
        let root = make_temp_dir("settings-migration");
        let local_dir = root.join("local");
        let config_dir = root.join("config");
        fs::create_dir_all(&local_dir).unwrap();
        fs::write(local_dir.join("settings.toml"), "theme = \"light\"").unwrap();

        migrate_to_config(&local_dir, &config_dir);

        assert_eq!(
            fs::read_to_string(config_dir.join("settings.toml")).unwrap(),
            "theme = \"light\""
        );
        assert!(!local_dir.join("settings.toml").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn migrate_to_config_does_not_overwrite_existing_settings() {
        let root = make_temp_dir("settings-migration-existing");
        let local_dir = root.join("local");
        let config_dir = root.join("config");
        fs::create_dir_all(&local_dir).unwrap();
        fs::create_dir_all(&config_dir).unwrap();
        fs::write(local_dir.join("settings.toml"), "old").unwrap();
        fs::write(config_dir.join("settings.toml"), "new").unwrap();

        migrate_to_config(&local_dir, &config_dir);

        assert_eq!(fs::read_to_string(config_dir.join("settings.toml")).unwrap(), "new");
        assert!(local_dir.join("settings.toml").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn empty_destination_directory_does_not_count_as_migrated() {
        let root = make_temp_dir("data-dir-migration");
        let empty = root.join("com.markdownrs.editor");
        let with_data = root.join("other");
        fs::create_dir_all(&empty).unwrap();
        fs::create_dir_all(with_data.join("Database")).unwrap();
        fs::write(with_data.join("Database/session.db"), "x").unwrap();

        assert!(!destination_is_in_use(&empty));
        assert!(destination_is_in_use(&with_data));
        assert!(!destination_is_in_use(&root.join("missing")));
        fs::remove_dir_all(&root).unwrap();
    }
}
