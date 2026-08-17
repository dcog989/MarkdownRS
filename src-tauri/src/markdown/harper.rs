use std::collections::HashMap;
use std::sync::Mutex;

use harper_core::linting::{FlatConfig, Lint, LintGroup, Linter};
use harper_core::parsers::MarkdownOptions;
use harper_core::spell::FstDictionary;
use harper_core::{Dialect, Document};

use super::linter::LintDiagnostic;
use crate::utils::MutexExt;

/// Per-call configuration of the Harper grammar checker.
#[derive(Default)]
pub struct HarperOptions {
    /// Whether Harper linting is enabled at all.
    pub enabled: bool,
    /// Per-rule overrides (rule name -> enabled). Unknown rule names are ignored.
    pub linter_overrides: HashMap<String, bool>,
}

/// Harper categorises lints as more important when their priority is lower.
/// Lints at or below this bound are surfaced as warnings; the rest as info.
const WARNING_PRIORITY_BOUND: u8 = 32;
/// Rules that are always disabled, regardless of user config.
/// `SpellCheck` overlaps with the app's own spellbook-based spellchecker.
const ALWAYS_DISABLED_RULES: &[&str] = &["SpellCheck"];

struct CachedGroup {
    /// Sorted serialisation of the overrides a group was built with.
    signature: String,
    group: LintGroup,
}

static CACHE: Mutex<Option<CachedGroup>> = Mutex::new(None);

/// Map char offsets (as used by Harper's `Span<char>`) to 1-based line/column positions.
struct LineIndex {
    /// Character offset where each line starts.
    line_starts: Vec<usize>,
    /// Total number of characters in the source.
    char_count: usize,
}

impl LineIndex {
    fn new(content: &str) -> Self {
        let mut line_starts = vec![0];
        let mut char_offset = 0;
        for c in content.chars() {
            if c == '\n' {
                line_starts.push(char_offset + 1);
            }
            char_offset += 1;
        }
        Self {
            line_starts,
            char_count: char_offset,
        }
    }

    fn position_of(&self, char_offset: usize) -> (usize, usize) {
        let line_index = self.line_starts.partition_point(|&s| s <= char_offset) - 1;
        (
            line_index + 1,
            char_offset - self.line_starts[line_index] + 1,
        )
    }
}

fn config_signature(overrides: &HashMap<String, bool>) -> String {
    let mut entries: Vec<String> = overrides
        .iter()
        .map(|(name, enabled)| format!("{name}={enabled}"))
        .collect();
    entries.sort();
    entries.join("|")
}

fn build_config(overrides: &HashMap<String, bool>) -> FlatConfig {
    let mut config = FlatConfig::new_curated();
    for (name, enabled) in overrides {
        if config.has_rule(name) {
            config.set_rule_enabled(name, *enabled);
        }
    }
    // Applied last so user overrides can never re-enable them.
    for rule in ALWAYS_DISABLED_RULES {
        config.set_rule_enabled(*rule, false);
    }
    config
}

fn build_group(overrides: &HashMap<String, bool>) -> LintGroup {
    LintGroup::new_curated(FstDictionary::curated(), Dialect::American)
        .with_lint_config(build_config(overrides))
}

fn map_lint(line_index: &LineIndex, lint: &Lint) -> Option<LintDiagnostic> {
    let start = lint.span.start;
    let end = lint.span.end;
    if start >= end || end > line_index.char_count {
        return None;
    }

    let (line, column) = line_index.position_of(start);
    let (end_line, end_column) = line_index.position_of(end);
    let severity = if lint.priority <= WARNING_PRIORITY_BOUND {
        "warning"
    } else {
        "info"
    };

    Some(LintDiagnostic {
        message: lint.message.clone(),
        line,
        column,
        end_line,
        end_column,
        severity: severity.to_string(),
        fixable: false,
        rule_name: Some(format!("{:?}", lint.lint_kind)),
        source: "harper".to_string(),
    })
}

/// Run the Harper grammar linters over `content` and map results to the
/// app's diagnostic format. `harper_linters` entries override the curated
/// rule configuration; unknown rule names are ignored.
pub fn lint_grammar(content: &str, overrides: &HashMap<String, bool>) -> Vec<LintDiagnostic> {
    let document = Document::new_markdown_curated(content, MarkdownOptions::default());
    let line_index = LineIndex::new(content);

    let signature = config_signature(overrides);

    let mut cache = CACHE.lock_or_recover();
    if cache.as_ref().is_none_or(|c| c.signature != signature) {
        *cache = Some(CachedGroup {
            signature,
            group: build_group(overrides),
        });
    }

    let group = &mut cache.as_mut().expect("cache slot populated").group;
    group
        .lint(&document)
        .iter()
        .filter_map(|lint| map_lint(&line_index, lint))
        .collect()
}
