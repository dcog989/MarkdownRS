use rumdl_lib::fix_coordinator::FixCoordinator;
use std::path::Path;

use super::config::load_rules_for_file;

pub fn format_markdown(
    content: &str,
    file_path: Option<&Path>,
    project_root: Option<&Path>,
) -> Result<String, String> {
    let (config, rules) = load_rules_for_file(file_path, project_root)?;

    let fix_coordinator = FixCoordinator::new();
    // Pass the content through untouched: rumdl's fix loop already normalizes
    // leading blank lines and line endings itself. Pre-stripping here removed
    // intentional leading blank lines unconditionally and, being `\n`-only,
    // could leave a stray `\r` behind on mixed-line-ending input.
    let mut content_buf = content.to_string();

    let file_path_buf = file_path.map(|p| p.to_path_buf());

    let result = fix_coordinator.apply_fixes_iterative(
        &rules,
        &[],
        &mut content_buf,
        &config,
        100,
        file_path_buf.as_deref(),
    );

    match result {
        Ok(_) => Ok(content_buf),
        Err(e) => Err(format!("Formatting failed: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_util::make_temp_dir;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir_with_config(name: &str) -> (PathBuf, PathBuf) {
        let dir = make_temp_dir(name);
        fs::write(dir.join(".rumdl.toml"), "[global]\n").unwrap();
        let file = dir.join("doc.md");
        (dir, file)
    }

    #[test]
    fn keeps_intentional_leading_blank_lines() {
        let (dir, file) = temp_dir_with_config("fmt-leading-blanks");
        let result = format_markdown("\n\n# Heading\n\nBody.\n", Some(&file), Some(&dir)).unwrap();

        assert!(
            result.starts_with('\n'),
            "leading blank line must be preserved, got: {result:?}"
        );
        assert!(result.contains("# Heading"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn crlf_leading_blanks_are_not_mangled_into_lone_carriage_returns() {
        let (dir, file) = temp_dir_with_config("fmt-crlf");
        let result = format_markdown(
            "\r\n\r\n# Heading\r\n\r\nBody.\r\n",
            Some(&file),
            Some(&dir),
        )
        .unwrap();

        let mut chars = result.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '\r' {
                assert_eq!(
                    chars.next(),
                    Some('\n'),
                    "stray carriage return in output: {result:?}"
                );
            }
        }
        assert!(result.contains("# Heading"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
