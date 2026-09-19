use crate::utils::{handle_error, run_blocking, validate_path};
use tokio::fs;

#[tauri::command]
pub async fn copy_file(from_path: String, to_path: String) -> Result<(), String> {
    validate_path(&from_path)?;
    validate_path(&to_path)?;

    run_blocking("copy file", move || {
        // Refuse to overwrite an existing target; the caller picks a fresh name.
        if std::fs::symlink_metadata(&to_path).is_ok() {
            return Err(handle_error(
                Some(&to_path),
                "copy file",
                "a file with that name already exists",
            ));
        }
        std::fs::copy(&from_path, &to_path)
            .map(|_| ())
            .map_err(|e| handle_error(Some(&from_path), "copy file", e))
    })
    .await
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
pub async fn ensure_dir(path: String) -> Result<(), String> {
    validate_path(&path)?;
    match fs::metadata(&path).await {
        Ok(meta) if meta.is_dir() => Ok(()),
        Ok(_) => Err(handle_error(
            Some(&path),
            "create directory",
            "path exists and is not a directory",
        )),
        Err(_) => fs::create_dir_all(&path)
            .await
            .map_err(|e| handle_error(Some(&path), "create directory", e)),
    }
}

#[tauri::command]
pub async fn path_exists(path: String) -> bool {
    if validate_path(&path).is_err() {
        return false;
    }
    fs::metadata(&path).await.is_ok()
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    validate_path(&old_path)?;
    validate_path(&new_path)?;

    // Refuse to overwrite an existing target. fs::rename() (rename(2) /
    // MoveFileExW with REPLACE) atomically replaces the destination, so a
    // direct rename would silently destroy whatever already sits at new_path.
    // The existence probe below leaves a tiny TOCTOU window; a fully race-free
    // no-replace rename would need renameat2(RENAME_NOREPLACE) or MoveFileExW
    // without the REPLACE flag, which std does not expose. A small probe
    // window is preferable to silent data loss.
    if fs::symlink_metadata(&new_path).await.is_ok() {
        return Err(handle_error(
            Some(&new_path),
            "rename file",
            "a file with that name already exists",
        ));
    }

    fs::rename(&old_path, &new_path).await.map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => handle_error(Some(&old_path), "rename file", "source file does not exist"),
        _ => handle_error(Some(&old_path), "rename file", e),
    })
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
        create_file(file.to_string_lossy().into_owned()).await.unwrap();
        assert!(file.is_file());
        assert_eq!(fs::read(&file).unwrap(), b"");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn rejects_existing_file() {
        let dir = make_temp_dir("create-file-existing");
        let file = dir.join("taken.md");
        fs::write(&file, "x").unwrap();
        assert!(create_file(file.to_string_lossy().into_owned()).await.is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn creates_new_dir() {
        let dir = make_temp_dir("create-dir");
        let sub = dir.join("sub");
        create_dir(sub.to_string_lossy().into_owned()).await.unwrap();
        assert!(sub.is_dir());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn rejects_existing_dir() {
        let dir = make_temp_dir("create-dir-existing");
        let sub = dir.join("sub");
        fs::create_dir(&sub).unwrap();
        assert!(create_dir(sub.to_string_lossy().into_owned()).await.is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn refuses_to_overwrite_existing_target() {
        let dir = make_temp_dir("rename-existing");
        let source = dir.join("source.md");
        let target = dir.join("target.md");
        fs::write(&source, "new content").unwrap();
        fs::write(&target, "existing content").unwrap();

        let result = rename_file(
            source.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .await;

        assert!(result.is_err(), "expected rename onto existing target to be refused");
        assert_eq!(fs::read_to_string(&target).unwrap(), "existing content");
        assert!(source.is_file(), "source should remain in place on refusal");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn renames_file_when_target_is_free() {
        let dir = make_temp_dir("rename-free");
        let source = dir.join("source.md");
        fs::write(&source, "content").unwrap();
        let target = dir.join("renamed.md");

        let result = rename_file(
            source.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .await;

        assert!(result.is_ok(), "expected rename to succeed: {:?}", result);
        assert_eq!(fs::read_to_string(&target).unwrap(), "content");
        assert!(!source.exists(), "source should be moved");
        fs::remove_dir_all(&dir).unwrap();
    }
}
