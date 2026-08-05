use crate::commands::settings::get_max_file_size_bytes;
use crate::utils::{decode_text, format_system_time, handle_error, run_blocking, validate_path};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tokio::fs;

fn bytes_to_mb(bytes: u64) -> u64 {
    bytes / 1024 / 1024
}

#[derive(Serialize)]
pub struct FileMetadata {
    pub created: Option<String>,
    pub modified: Option<String>,
    pub size: u64,
}

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
    pub encoding: String,
}

#[tauri::command]
pub async fn read_text_file(
    path: String,
    app_handle: tauri::AppHandle,
) -> Result<FileContent, String> {
    let (result, duration) = crate::timed!({
        validate_path(&path)?;
        let metadata = fs::metadata(&path)
            .await
            .map_err(|e| handle_error(Some(&path), "read metadata", e))?;

        if metadata.is_dir() {
            log::warn!("Attempted to read directory as file: {}", path);
            return Err("Cannot read a directory as a text file".to_string());
        }

        let max_file_size = get_max_file_size_bytes(&app_handle).await;

        if metadata.len() > max_file_size {
            log::warn!(
                "File too large to read: {} ({} MB)",
                path,
                bytes_to_mb(metadata.len())
            );
            return Err(format!(
                "File too large: {} MB (max {} MB)",
                bytes_to_mb(metadata.len()),
                bytes_to_mb(max_file_size)
            ));
        }

        let bytes = fs::read(&path)
            .await
            .map_err(|e| handle_error(Some(&path), "read file", e))?;

        let (content, encoding) = decode_text(bytes);
        Ok::<_, String>(FileContent { content, encoding })
    });
    let result = result?;

    log::info!(
        "[Storage] read_text_file | duration={:?} | size={} bytes | path={}",
        duration,
        result.content.len(),
        path
    );

    Ok(result)
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<bool, String> {
    let content_size = content.len();

    crate::timed_info!(
        "[Storage]",
        "write_text_file",
        {
            validate_path(&path)?;
            let path_buf = PathBuf::from(&path);
            crate::utils::atomic_write(&path_buf, content.as_bytes())
                .await
                .map_err(|e| handle_error(Some(&path), "save file", e))?;
            Ok::<_, String>(true)
        },
        size = content_size,
        path = path,
    )
}

#[tauri::command]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    validate_path(&path)?;
    let metadata = fs::metadata(&path)
        .await
        .map_err(|e| handle_error(Some(&path), "get metadata", e))?;
    Ok(FileMetadata {
        created: format_system_time(metadata.created()),
        modified: format_system_time(metadata.modified()),
        size: metadata.len(),
    })
}

#[tauri::command]
pub async fn send_to_recycle_bin(path: String) -> Result<(), String> {
    validate_path(&path)?;
    run_blocking("send to recycle bin", move || {
        trash::delete(&path).map_err(|e| handle_error(Some(&path), "send to recycle bin", e))
    })
    .await
}

#[tauri::command]
pub async fn resolve_path_relative(
    base_path: Option<String>,
    click_path: String,
) -> Result<String, String> {
    validate_path(&click_path)?;

    let click_is_absolute = Path::new(&click_path).is_absolute();

    // Get the base directory for path traversal protection
    let base_dir = base_path
        .as_ref()
        .and_then(|base| PathBuf::from(base).parent().map(|p| p.to_path_buf()));

    let path_buf = if let Some(base) = base_path {
        let mut p = PathBuf::from(base);
        p.pop();
        p.push(click_path);
        p
    } else {
        PathBuf::from(click_path)
    };

    // Canonicalize the path to resolve any symlinks and get absolute path
    let canonicalized = dunce::canonicalize(&path_buf).map_err(|e| {
        let path_str = path_buf.to_string_lossy();
        handle_error(Some(&path_str), "canonicalize path", e)
    })?;

    // Absolute paths are explicit user navigation; no containment is applied.
    // Relative paths must stay within the base directory. Without a base
    // directory (unsaved buffer) there is nothing to contain against, so
    // resolving against the process CWD would escape any reasonable scope.
    if !click_is_absolute {
        let Some(ref base) = base_dir else {
            return Err("Cannot resolve a relative path without a base directory".to_string());
        };
        let canonical_base = dunce::canonicalize(base).map_err(|e| {
            let base_str = base.to_string_lossy();
            handle_error(Some(&base_str), "canonicalize base path", e)
        })?;

        if !canonicalized.starts_with(&canonical_base) {
            log::warn!(
                "Path traversal blocked: resolved path {:?} is outside base directory {:?}",
                canonicalized,
                canonical_base
            );
            return Err("Access denied: path escapes base directory".to_string());
        }
    }

    log::debug!("Resolved path: {:?}", canonicalized);
    Ok(canonicalized.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn write_binary_file(path: String, content: Vec<u8>) -> Result<(), String> {
    validate_path(&path)?;
    let path_buf = PathBuf::from(&path);

    crate::utils::atomic_write(&path_buf, &content)
        .await
        .map_err(|e| handle_error(Some(&path), "write binary file", e))?;

    log::debug!("Successfully wrote binary file: {}", path);
    Ok(())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    validate_path(&path)?;
    // create_new fails if the file already exists, preventing silent overwrites.
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .await
        .map(|_| ())
        .map_err(|e| handle_error(Some(&path), "create file", e))
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), String> {
    validate_path(&path)?;
    fs::create_dir(&path)
        .await
        .map_err(|e| handle_error(Some(&path), "create directory", e))
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    validate_path(&old_path)?;
    validate_path(&new_path)?;

    // Attempt the rename directly instead of doing separate existence probes
    // (TOCTOU: the filesystem can change between probe and operation).
    // Map the resulting error kinds to user-friendly messages.
    fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => {
                handle_error(Some(&old_path), "rename file", "source file does not exist")
            },
            std::io::ErrorKind::AlreadyExists => handle_error(
                Some(&new_path),
                "rename file",
                "a file with that name already exists",
            ),
            _ => handle_error(Some(&old_path), "rename file", e),
        })
}

#[tauri::command]
pub async fn add_to_file_history(
    state: tauri::State<'_, crate::state::AppState>,
    path: String,
    last_opened: String,
) -> Result<(), String> {
    state
        .db
        .file_history()
        .add_file_history_entry(&path, &last_opened)
        .map_err(|e| handle_error(Some(&path), "add to file history", e))
}

#[tauri::command]
pub async fn get_file_history(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<Vec<String>, String> {
    state
        .db
        .file_history()
        .get_file_history()
        .map_err(|e| handle_error(None, "get file history", e))
}

#[tauri::command]
pub async fn remove_from_file_history(
    state: tauri::State<'_, crate::state::AppState>,
    path: String,
) -> Result<(), String> {
    state
        .db
        .file_history()
        .remove_file_history_entry(&path)
        .map_err(|e| handle_error(Some(&path), "remove from file history", e))
}

#[tauri::command]
pub async fn clear_file_history(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<(), String> {
    state
        .db
        .file_history()
        .clear_file_history()
        .map_err(|e| handle_error(None, "clear file history", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_util::make_temp_dir;
    use std::fs;

    #[tokio::test]
    async fn creates_new_file() {
        let dir = make_temp_dir("create-file");
        let file = dir.join("notes.md");
        create_file(file.to_string_lossy().into_owned())
            .await
            .unwrap();
        assert!(file.is_file());
        assert_eq!(fs::read(&file).unwrap(), b"");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn rejects_existing_file() {
        let dir = make_temp_dir("create-file-existing");
        let file = dir.join("taken.md");
        fs::write(&file, "x").unwrap();
        assert!(
            create_file(file.to_string_lossy().into_owned())
                .await
                .is_err()
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn creates_new_dir() {
        let dir = make_temp_dir("create-dir");
        let sub = dir.join("sub");
        create_dir(sub.to_string_lossy().into_owned())
            .await
            .unwrap();
        assert!(sub.is_dir());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn rejects_existing_dir() {
        let dir = make_temp_dir("create-dir-existing");
        let sub = dir.join("sub");
        fs::create_dir(&sub).unwrap();
        assert!(
            create_dir(sub.to_string_lossy().into_owned())
                .await
                .is_err()
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn rejects_relative_path_without_base_directory() {
        let dir = make_temp_dir("resolve-no-base");
        let file = dir.join("doc.md");
        fs::write(&file, "x").unwrap();

        let result = resolve_path_relative(None, "../escaped.md".to_string()).await;

        assert!(
            result.is_err(),
            "expected relative path without base to be rejected"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn rejects_relative_path_escaping_base_directory() {
        let root = make_temp_dir("resolve-escape");
        let subdir = root.join("subdir");
        fs::create_dir_all(&subdir).unwrap();
        let base = subdir.join("doc.md");
        fs::write(&base, "x").unwrap();
        let escaped = root.join("escaped.md");
        fs::write(&escaped, "x").unwrap();

        let result = resolve_path_relative(
            Some(base.to_string_lossy().into_owned()),
            "../escaped.md".to_string(),
        )
        .await;

        assert!(result.is_err(), "expected escaping path to be rejected");
        fs::remove_dir_all(&root).unwrap();
    }

    #[tokio::test]
    async fn resolves_relative_path_within_base_directory() {
        let root = make_temp_dir("resolve-within");
        let subdir = root.join("subdir");
        fs::create_dir_all(&subdir).unwrap();
        let base = subdir.join("doc.md");
        fs::write(&base, "x").unwrap();
        let target = subdir.join("notes.md");
        fs::write(&target, "x").unwrap();

        let result = resolve_path_relative(
            Some(base.to_string_lossy().into_owned()),
            "notes.md".to_string(),
        )
        .await;

        assert_eq!(
            result.unwrap(),
            dunce::canonicalize(&target).unwrap().to_string_lossy()
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[tokio::test]
    async fn resolves_absolute_path_without_base_directory() {
        let dir = make_temp_dir("resolve-absolute");
        let file = dir.join("doc.md");
        fs::write(&file, "x").unwrap();

        let result = resolve_path_relative(None, file.to_string_lossy().into_owned()).await;

        assert_eq!(
            result.unwrap(),
            dunce::canonicalize(&file).unwrap().to_string_lossy()
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
