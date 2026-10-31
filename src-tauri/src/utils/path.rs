/// Rejects input the OS cannot represent. This is not a scope check: callers
/// pass user-chosen paths, so nothing here limits where a path may point.
// shortcut: no path scope enforcement; the webview is trusted, add an allowlist if that changes.
pub fn validate_path_input(path: &str) -> Result<(), String> {
    if path.contains('\0') {
        return Err("Invalid path: contains null bytes".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_null_bytes() {
        assert!(validate_path_input("bad\x00path").is_err());
    }

    #[test]
    fn accepts_user_chosen_paths() {
        assert!(validate_path_input("/home/user/docs/notes.md").is_ok());
        assert!(validate_path_input("relative/path.txt").is_ok());
        assert!(validate_path_input("../../../x.md").is_ok());
        assert!(validate_path_input("/home/user/100%252e.md").is_ok());
    }
}
