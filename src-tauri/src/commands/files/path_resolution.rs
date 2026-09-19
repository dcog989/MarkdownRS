use crate::utils::{handle_error, validate_path};
use std::path::{Path, PathBuf};

#[tauri::command]
pub async fn resolve_path_relative(base_path: Option<String>, click_path: String) -> Result<String, String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_util::make_temp_dir;
    use std::fs;

    #[tokio::test]
    async fn rejects_relative_path_without_base_directory() {
        let dir = make_temp_dir("resolve-no-base");
        let file = dir.join("doc.md");
        fs::write(&file, "x").unwrap();

        let result = resolve_path_relative(None, "../escaped.md".to_string()).await;

        assert!(result.is_err(), "expected relative path without base to be rejected");
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

        let result =
            resolve_path_relative(Some(base.to_string_lossy().into_owned()), "../escaped.md".to_string()).await;

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

        let result = resolve_path_relative(Some(base.to_string_lossy().into_owned()), "notes.md".to_string()).await;

        assert_eq!(result.unwrap(), dunce::canonicalize(&target).unwrap().to_string_lossy());
        fs::remove_dir_all(&root).unwrap();
    }

    #[tokio::test]
    async fn resolves_absolute_path_without_base_directory() {
        let dir = make_temp_dir("resolve-absolute");
        let file = dir.join("doc.md");
        fs::write(&file, "x").unwrap();

        let result = resolve_path_relative(None, file.to_string_lossy().into_owned()).await;

        assert_eq!(result.unwrap(), dunce::canonicalize(&file).unwrap().to_string_lossy());
        fs::remove_dir_all(&dir).unwrap();
    }
}
