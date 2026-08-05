use crate::utils::{format_system_time, handle_error, run_blocking, validate_path};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified: Option<String>,
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn sort_entries(a: &FileEntry, b: &FileEntry) -> std::cmp::Ordering {
    b.is_dir
        .cmp(&a.is_dir)
        .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
}

pub fn list_directory_sync(path: &str, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    validate_path(path)?;
    let entries =
        std::fs::read_dir(path).map_err(|e| handle_error(Some(path), "read directory", e))?;

    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| handle_error(Some(path), "read directory entry", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !show_hidden && is_hidden(&name) {
            continue;
        }

        let file_type = entry
            .file_type()
            .map_err(|e| handle_error(Some(&name), "get file type", e))?;
        let is_symlink = file_type.is_symlink();

        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = metadata
            .as_ref()
            .and_then(|m| format_system_time(m.modified()));

        result.push(FileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            is_symlink,
            size,
            modified,
        });
    }

    result.sort_by(sort_entries);
    Ok(result)
}

#[tauri::command]
pub async fn list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let (result, duration) = crate::timed!({
        let path_for_task = path.clone();
        run_blocking("list directory", move || {
            list_directory_sync(&path_for_task, show_hidden)
        })
    });
    let entries = result.await?;

    log::info!(
        "[Storage] list_directory | duration={:?} | entries={} | path={}",
        duration,
        entries.len(),
        path
    );

    Ok(entries)
}

pub fn get_directory_mtime_sync(path: &str) -> Result<Option<u64>, String> {
    validate_path(path)?;
    let metadata = std::fs::metadata(path).map_err(|e| handle_error(Some(path), "stat path", e))?;
    if !metadata.is_dir() {
        return Ok(None);
    }
    let mtime = metadata.modified().ok().and_then(|t| {
        t.duration_since(std::time::UNIX_EPOCH)
            .ok()
            .map(|d| d.as_millis() as u64)
    });
    Ok(mtime)
}

#[tauri::command]
pub async fn get_directory_mtime(path: String) -> Result<Option<u64>, String> {
    let (result, duration) = crate::timed!({
        let path_for_task = path.clone();
        run_blocking("stat directory", move || {
            get_directory_mtime_sync(&path_for_task)
        })
    });
    let mtime = result.await?;

    // Stat is a hot path (runs on every poll tick), so keep it at debug level.
    log::debug!(
        "[Storage] get_directory_mtime | duration={:?} | path={}",
        duration,
        path
    );

    Ok(mtime)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_util::make_temp_dir;
    use std::fs;
    use std::path::Path;

    fn list_names(dir: &Path, show_hidden: bool) -> Vec<String> {
        list_directory_sync(&dir.to_string_lossy(), show_hidden)
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect()
    }

    #[test]
    fn sorts_directories_first_then_alphabetically() {
        let dir = make_temp_dir("sort");
        fs::create_dir(dir.join("zeta_dir")).unwrap();
        fs::write(dir.join("alpha.txt"), "hello").unwrap();
        fs::write(dir.join("beta.md"), "# hi").unwrap();
        fs::create_dir(dir.join("Apple_dir")).unwrap();

        let names = list_names(&dir, false);

        assert_eq!(names, vec!["Apple_dir", "zeta_dir", "alpha.txt", "beta.md"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn skips_hidden_entries_unless_requested() {
        let dir = make_temp_dir("hidden");
        fs::write(dir.join(".gitignore"), "#").unwrap();
        fs::write(dir.join("visible.md"), "# v").unwrap();

        let filtered = list_names(&dir, false);
        assert_eq!(filtered, vec!["visible.md"]);

        let unfiltered = list_names(&dir, true);
        assert_eq!(unfiltered.len(), 2);
        assert!(unfiltered.contains(&".gitignore".to_string()));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn reports_entry_metadata() {
        let dir = make_temp_dir("meta");
        let file = dir.join("data.txt");
        fs::write(&file, "content").unwrap();
        fs::create_dir(dir.join("sub")).unwrap();

        let entries = list_directory_sync(&dir.to_string_lossy(), false).unwrap();
        let file_entry = entries.iter().find(|e| e.name == "data.txt").unwrap();
        let dir_entry = entries.iter().find(|e| e.name == "sub").unwrap();

        assert!(!file_entry.is_dir);
        assert!(!file_entry.is_symlink);
        assert_eq!(file_entry.size, 7);
        assert!(file_entry.modified.is_some());
        assert!(file_entry.path.ends_with("data.txt"));

        assert!(dir_entry.is_dir);
        assert!(dir_entry.modified.is_some());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn errors_on_missing_directory() {
        let result = list_directory_sync("/nonexistent/markdownrs-xyz-404", false);
        assert!(result.is_err());
    }

    #[test]
    fn reports_directory_mtime_only_for_directories() {
        let dir = make_temp_dir("mtime");
        let mtime = get_directory_mtime_sync(&dir.to_string_lossy()).unwrap();
        assert!(mtime.is_some() && mtime.unwrap() > 0);

        let file = dir.join("f.txt");
        fs::write(&file, "x").unwrap();
        assert_eq!(
            get_directory_mtime_sync(&file.to_string_lossy()).unwrap(),
            None
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn validates_paths_before_reading() {
        let result = list_directory_sync("bad\x00path", false);
        assert!(result.is_err());
    }
}
