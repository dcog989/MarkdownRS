use std::collections::HashMap;
use std::sync::Mutex;

use harper_core::linting::{FlatConfig, Lint, LintGroup};
use harper_core::parsers::MarkdownOptions;
use harper_core::spell::FstDictionary;
use harper_core::{Dialect, Document};

use super::linter::{LINT_SOURCE_HARPER, LintDiagnostic, SEVERITY_INFO, SEVERITY_WARNING};
use crate::utils::MutexExt;

/// Per-call configuration of the Harper grammar checker.
pub struct HarperOptions {
    /// Whether Harper linting is enabled at all.
    pub enabled: bool,
    /// Per-rule overrides (rule name -> enabled). Unknown rule names are ignored.
    pub linter_overrides: HashMap<String, bool>,
}

impl Default for HarperOptions {
    /// Grammar checking defaults to on, matching the app setting and the
    /// `lint_markdown` command's fallback when the flag is omitted.
    fn default() -> Self {
        Self {
            enabled: true,
            linter_overrides: HashMap::new(),
        }
    }
}

impl HarperOptions {
    /// Constructs an options value with grammar checking disabled. Used by
    /// unit tests so lint output stays hermetic.
    #[cfg(test)]
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            linter_overrides: HashMap::new(),
        }
    }
}

/// Harper categorises lints as more important when their priority is lower.
/// Lints at or below this bound are surfaced as warnings; the rest as info.
const WARNING_PRIORITY_BOUND: u8 = 32;
/// Rules that are always disabled, regardless of user config.
/// `SpellCheck` overlaps with the app's own spellbook-based spellchecker.
const ALWAYS_DISABLED_RULES: &[&str] = &["SpellCheck"];

struct CachedGroup {
    /// The overrides a group was built with; a group is rebuilt when this
    /// differs from the requested overrides.
    overrides: HashMap<String, bool>,
    group: LintGroup,
}

/// Shared `LintGroup` across the whole process. `LintGroup::lint` mutates its
/// internal content-hashed caches, so the mutex is held for the full CPU-bound
/// lint; concurrent lint calls (e.g. multiple tabs) therefore serialize on this
/// single lock. This is the price of warming the group's caches across calls.
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

fn map_lint(line_index: &LineIndex, rule_name: &str, lint: &Lint) -> Option<LintDiagnostic> {
    let start = lint.span.start;
    let end = lint.span.end;
    if start >= end || end > line_index.char_count {
        return None;
    }

    let (line, column) = line_index.position_of(start);
    let (end_line, end_column) = line_index.position_of(end);
    let severity = if lint.priority <= WARNING_PRIORITY_BOUND {
        SEVERITY_WARNING
    } else {
        SEVERITY_INFO
    };

    Some(LintDiagnostic {
        message: lint.message.clone(),
        line,
        column,
        end_line,
        end_column,
        severity: severity.to_string(),
        fixable: false,
        rule_name: Some(rule_name.to_string()),
        source: LINT_SOURCE_HARPER.to_string(),
    })
}

/// Run the Harper grammar linters over `content` and map results to the
/// app's diagnostic format. `harper_linters` entries override the curated
/// rule configuration; unknown rule names are ignored.
pub fn lint_grammar(content: &str, overrides: &HashMap<String, bool>) -> Vec<LintDiagnostic> {
    let document = Document::new_markdown_curated(content, MarkdownOptions::default());
    let line_index = LineIndex::new(content);

    rebuild_cached_group_if_needed(overrides);

    let mut cache = CACHE.lock_or_recover();
    let group = {
        let slot = cache.as_mut().expect("cache slot populated");
        // rebuild_cached_group_if_needed rebuilt outside the lock; a concurrent
        // call may have swapped the group for a different config in between, so
        // honor the overrides actually requested here. Rare, so building under
        // the lock is acceptable.
        if slot.overrides != *overrides {
            slot.overrides = overrides.clone();
            slot.group = build_group(overrides);
        }
        &mut slot.group
    };
    group
        .organized_lints(&document)
        .into_iter()
        .flat_map(|(rule_name, lints)| {
            lints
                .into_iter()
                .filter_map(|lint| map_lint(&line_index, &rule_name, &lint))
                .collect::<Vec<_>>()
        })
        .collect()
}

/// Rebuilds the cached `LintGroup` when the requested rule configuration no
/// longer matches what it was built with. The group is built outside the lock
/// so a config change does not stall concurrent lint calls; the check inside
/// the lock picks one winner when several calls race.
fn rebuild_cached_group_if_needed(overrides: &HashMap<String, bool>) {
    let needs_rebuild = {
        let cache = CACHE.lock_or_recover();
        cache.as_ref().is_none_or(|c| c.overrides != *overrides)
    };
    if !needs_rebuild {
        return;
    }

    let group = build_group(overrides);

    let mut cache = CACHE.lock_or_recover();
    match cache.as_mut() {
        Some(cached) if cached.overrides != *overrides => {
            cached.overrides = overrides.clone();
            cached.group = group;
        },
        None => {
            *cache = Some(CachedGroup {
                overrides: overrides.clone(),
                group,
            });
        },
        _ => {},
    }
}
