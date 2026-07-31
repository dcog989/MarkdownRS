use std::path::{Component, Path};

const MAX_PARENT_DIRS: usize = 3;

const RESERVED_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

pub fn validate_path(path: &str) -> Result<(), String> {
    if path.contains('\0') {
        return Err("Invalid path: contains null bytes".to_string());
    }

    if path.contains("..%2e") || path.contains("%2e%2e") || path.contains("%252e") {
        return Err("Invalid path: contains encoded directory traversal".to_string());
    }

    let parent_components = Path::new(path)
        .components()
        .filter(|c| *c == Component::ParentDir)
        .count();
    if parent_components > MAX_PARENT_DIRS {
        return Err("Invalid path: excessive directory traversal".to_string());
    }

    if let Some(stem) = Path::new(path).file_stem().and_then(|s| s.to_str()) {
        let stem_upper = stem.to_uppercase();
        if RESERVED_NAMES.contains(&stem_upper.as_str()) {
            return Err(format!("Invalid path: '{}' is a reserved name", stem));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_null_bytes() {
        assert!(validate_path("bad\x00path").is_err());
    }

    #[test]
    fn rejects_encoded_directory_traversal() {
        assert!(validate_path("a/..%2eb").is_err());
        assert!(validate_path("a/%2e%2e/b").is_err());
        assert!(validate_path("a/%252eb").is_err());
    }

    #[test]
    fn rejects_excessive_parent_components() {
        assert!(validate_path("../../../../../etc/passwd").is_err());
    }

    #[test]
    fn allows_up_to_three_parent_components() {
        assert!(validate_path("../../../x.md").is_ok());
    }

    #[test]
    fn rejects_windows_reserved_names_case_insensitively() {
        for name in [
            "CON", "con.txt", "CON.md", "NUL", "PRN", "AUX", "COM1", "LPT1",
        ] {
            assert!(
                validate_path(name).is_err(),
                "expected '{}' to be rejected",
                name
            );
        }
    }

    #[test]
    fn allows_names_that_merely_start_with_reserved_names() {
        assert!(validate_path("console.log").is_ok());
        assert!(validate_path("printer.md").is_ok());
    }

    #[test]
    fn accepts_normal_paths() {
        assert!(validate_path("/home/user/docs/notes.md").is_ok());
        assert!(validate_path("relative/path.txt").is_ok());
    }
}
