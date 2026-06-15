use rumdl_lib::config::Config;
use rumdl_lib::rule::LintWarning;
use rumdl_lib::rule::Severity;
use rumdl_lib::rules::{all_rules, filter_rules};
use serde::Serialize;
use std::path::Path;

use super::config::load_rumdl_config;

#[derive(Debug, Serialize)]
pub struct LintDiagnostic {
    pub message: String,
    pub line: usize,
    pub column: usize,
    pub end_line: usize,
    pub end_column: usize,
    pub severity: String,
    pub fixable: bool,
    pub rule_name: Option<String>,
}

fn map_severity(s: &Severity) -> &'static str {
    match s {
        Severity::Error => "error",
        Severity::Warning => "warning",
        Severity::Info => "info",
    }
}

fn map_warning(w: &LintWarning) -> LintDiagnostic {
    LintDiagnostic {
        message: w.message.clone(),
        line: w.line,
        column: w.column,
        end_line: w.end_line,
        end_column: w.end_column,
        severity: map_severity(&w.severity).to_string(),
        fixable: w.fix.is_some(),
        rule_name: w.rule_name.clone(),
    }
}

pub fn lint_content(
    content: &str,
    file_path: Option<&Path>,
    project_root: Option<&Path>,
) -> Result<Vec<LintDiagnostic>, String> {
    let config: Config = if let (Some(fp), Some(pr)) = (file_path, project_root) {
        let file_dir = fp.parent().unwrap_or(pr);
        load_rumdl_config(file_dir, pr)?
    } else {
        Config::default()
    };

    let all_rules = all_rules(&config);
    let rules = filter_rules(&all_rules, &config.global);

    let flavor = file_path
        .map(|p| config.get_flavor_for_file(p))
        .unwrap_or(config.markdown_flavor());

    let result = rumdl_lib::lint(
        content,
        &rules,
        false,
        flavor,
        file_path.map(|p| p.to_path_buf()),
        Some(&config),
    );

    match result {
        Ok(warnings) => Ok(warnings.iter().map(map_warning).collect()),
        Err(e) => Err(format!("Lint error: {}", e)),
    }
}
