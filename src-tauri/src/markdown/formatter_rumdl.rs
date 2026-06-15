use rumdl_lib::config::Config;
use rumdl_lib::fix_coordinator::FixCoordinator;
use rumdl_lib::rules::{all_rules, filter_rules};
use std::path::Path;

use super::config::load_rumdl_config;

pub fn format_markdown(
    content: &str,
    file_path: Option<&Path>,
    project_root: Option<&Path>,
) -> Result<String, String> {
    let config: Config = if let (Some(fp), Some(pr)) = (file_path, project_root) {
        let file_dir = fp.parent().unwrap_or(pr);
        load_rumdl_config(file_dir, pr)?
    } else {
        Config::default()
    };

    let all_rules = all_rules(&config);
    let rules = filter_rules(&all_rules, &config.global);

    let fix_coordinator = FixCoordinator::new();
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
