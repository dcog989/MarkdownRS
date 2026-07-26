use rumdl_lib::fix_coordinator::FixCoordinator;
use std::path::Path;

use super::config::load_rules_for_file;

fn strip_leading_blank_lines(s: &str) -> String {
    s.trim_start_matches('\n').to_string()
}

pub fn format_markdown(
    content: &str,
    file_path: Option<&Path>,
    project_root: Option<&Path>,
) -> Result<String, String> {
    let (config, rules) = load_rules_for_file(file_path, project_root)?;

    let fix_coordinator = FixCoordinator::new();
    let mut content_buf = strip_leading_blank_lines(content);

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
