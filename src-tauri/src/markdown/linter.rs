use rumdl_lib::rule::LintWarning;
use rumdl_lib::rule::Severity;
use serde::Serialize;
use std::path::Path;

use super::config::load_rules_for_file;
use super::harper::{self, HarperOptions};

const LINT_SOURCE_RUMDL: &str = "rumdl";
/// Harper diagnostics are tagged with this source so the UI can group them.
pub const LINT_SOURCE_HARPER: &str = "harper";

/// Severity strings shared by every lint source (rumdl, harper, ...).
pub const SEVERITY_ERROR: &str = "error";
pub const SEVERITY_WARNING: &str = "warning";
pub const SEVERITY_INFO: &str = "info";

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
    pub source: String,
}

fn map_severity(s: &Severity) -> &'static str {
    match s {
        Severity::Error => SEVERITY_ERROR,
        Severity::Warning => SEVERITY_WARNING,
        Severity::Info => SEVERITY_INFO,
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
        source: LINT_SOURCE_RUMDL.to_string(),
    }
}

pub fn lint_content(
    content: &str,
    file_path: Option<&Path>,
    project_root: Option<&Path>,
    harper_options: &HarperOptions,
) -> Result<Vec<LintDiagnostic>, String> {
    let (config, rules) = load_rules_for_file(file_path, project_root)?;

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

    let mut diagnostics: Vec<LintDiagnostic> = match result {
        Ok(warnings) => warnings.iter().map(map_warning).collect(),
        Err(e) => return Err(format!("Lint error: {}", e)),
    };

    if harper_options.enabled {
        diagnostics.extend(harper::lint_grammar(
            content,
            &harper_options.linter_overrides,
        ));
    }

    // Sources report in their own order; sort so callers see document order.
    diagnostics.sort_by_key(|d| (d.line, d.column));

    Ok(diagnostics)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_util::make_temp_dir;
    use rumdl_lib::rule::Severity;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir_with_config(name: &str, config_body: &str) -> PathBuf {
        let dir = make_temp_dir(name);
        fs::write(dir.join(".rumdl.toml"), config_body).unwrap();
        dir
    }

    fn fake_file(dir: &Path, name: &str) -> PathBuf {
        dir.join(name)
    }

    #[test]
    fn map_severity_maps_all_severities() {
        assert_eq!(map_severity(&Severity::Error), "error");
        assert_eq!(map_severity(&Severity::Warning), "warning");
        assert_eq!(map_severity(&Severity::Info), "info");
    }

    #[test]
    fn map_warning_copies_all_fields() {
        let warning = LintWarning {
            message: "Trailing spaces".to_string(),
            line: 3,
            column: 7,
            end_line: 3,
            end_column: 10,
            severity: Severity::Warning,
            fix: None,
            rule_name: Some("MD009".to_string()),
        };

        let diagnostic = map_warning(&warning);

        assert_eq!(diagnostic.message, "Trailing spaces");
        assert_eq!(diagnostic.line, 3);
        assert_eq!(diagnostic.column, 7);
        assert_eq!(diagnostic.end_line, 3);
        assert_eq!(diagnostic.end_column, 10);
        assert_eq!(diagnostic.severity, "warning");
        assert!(!diagnostic.fixable);
        assert_eq!(diagnostic.rule_name.as_deref(), Some("MD009"));
    }

    #[test]
    fn map_warning_reports_fixable_when_a_fix_exists() {
        // MD009's trailing-space fix is auto-fixable.
        let dir = temp_dir_with_config("fixable", "[global]\n");
        let file = fake_file(&dir, "doc.md");
        let result = lint_content(
            "# Heading\n\nbody   \n",
            Some(&file),
            Some(&dir),
            &HarperOptions::disabled(),
        )
        .unwrap();
        let fixable = result.iter().any(|d| d.fixable);
        assert!(
            fixable,
            "expected at least one fixable diagnostic, got {:?}",
            result
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn default_rules_flag_trailing_whitespace() {
        let dir = temp_dir_with_config("default", "[global]\n");
        let file = fake_file(&dir, "doc.md");
        let result = lint_content(
            "# Heading\n\nbody   \n",
            Some(&file),
            Some(&dir),
            &HarperOptions::disabled(),
        )
        .unwrap();

        assert!(
            result.iter().any(|d| d.line == 3),
            "expected a diagnostic on line 3, got {:?}",
            result
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn all_rules_disabled_produces_no_warnings() {
        let dir = temp_dir_with_config("disabled", "[global]\ndisable = [\"all\"]\n");
        let file = fake_file(&dir, "doc.md");
        let result = lint_content(
            "# Heading\n\nbody  \n",
            Some(&file),
            Some(&dir),
            &HarperOptions::disabled(),
        )
        .unwrap();

        assert!(result.is_empty(), "expected no warnings, got {:?}", result);
        fs::remove_dir_all(&dir).unwrap();
    }
}
