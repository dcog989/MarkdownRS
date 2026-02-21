use crate::markdown::config::{DEFAULT_LIST_INDENT, MarkdownFlavor};
use anyhow::{Result, anyhow};
use dprint_plugin_markdown::configuration::{
    ConfigurationBuilder, EmphasisKind, StrongKind, TextWrap, UnorderedListKind,
};
use dprint_plugin_markdown::format_text;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

// Lazy-compiled regexes
static BACKSLASH_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)(^|[^\\])\\\r?$").expect("Invalid BACKSLASH_RE"));

static BULLET_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(\s*)- ").expect("Invalid BULLET_RE"));

static UNORDERED_LIST_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(\s*)[-*+] ").expect("Invalid UNORDERED_LIST_RE"));

static ORDERED_LIST_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(\s*)\d+\. ").expect("Invalid ORDERED_LIST_RE"));

// Regex to detect box-drawing characters and ASCII art
static BOX_DRAWING_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[│┤┐└┴┬├─┼╔╗╚╝║═╠╣╦╩╬▀▄█▌▐░▒▓■□▪▫]").expect("Invalid BOX_DRAWING_RE")
});

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormatterOptions {
    pub flavor: MarkdownFlavor,
    pub list_indent: usize,
    pub code_block_fence: String,
    pub bullet_char: String,
    pub emphasis_char: String,
    pub table_alignment: bool,
    pub normalize_whitespace: bool,
    pub max_blank_lines: usize,
}

impl Default for FormatterOptions {
    fn default() -> Self {
        Self {
            flavor: MarkdownFlavor::default(),
            list_indent: DEFAULT_LIST_INDENT,
            code_block_fence: "```".to_string(),
            bullet_char: "-".to_string(),
            emphasis_char: "*".to_string(),
            table_alignment: true,
            normalize_whitespace: true,
            max_blank_lines: crate::markdown::config::DEFAULT_MAX_BLANK_LINES,
        }
    }
}

pub fn format_markdown(content: &str, options: &FormatterOptions) -> Result<String> {
    // Replace protected lines (box-drawing / ASCII art) with unique tokens before
    // handing the text to dprint, so dprint line-count shifts cannot desync their positions.
    let mut protected_lines: Vec<(String, String)> = Vec::new();
    let mut tokenised = String::with_capacity(content.len());

    for (idx, line) in content.lines().enumerate() {
        if BOX_DRAWING_RE.is_match(line) {
            let token = format!("__PROTECTED_LINE_{}__", idx);
            protected_lines.push((token.clone(), line.to_string()));
            tokenised.push_str(&token);
        } else {
            tokenised.push_str(line);
        }
        tokenised.push('\n');
    }
    if !content.ends_with('\n') {
        tokenised.pop();
    }

    let mut builder = ConfigurationBuilder::new();
    builder.text_wrap(TextWrap::Maintain);

    if let Some(char) = options.emphasis_char.chars().next() {
        let (e_kind, s_kind) = match char {
            '_' => (EmphasisKind::Underscores, StrongKind::Underscores),
            _ => (EmphasisKind::Asterisks, StrongKind::Asterisks),
        };
        builder.emphasis_kind(e_kind);
        builder.strong_kind(s_kind);
    } else {
        builder.emphasis_kind(EmphasisKind::Asterisks);
        builder.strong_kind(StrongKind::Asterisks);
    }

    if let Some(char) = options.bullet_char.chars().next() {
        let kind = match char {
            '*' => UnorderedListKind::Asterisks,
            _ => UnorderedListKind::Dashes,
        };
        builder.unordered_list_kind(kind);
    }

    let config = builder.build();

    // dprint formatting
    let input = if protected_lines.is_empty() {
        content
    } else {
        &tokenised
    };
    let formatted = format_text(input, &config, |_, file_text, _| {
        Ok(Some(file_text.to_string()))
    })
    .map(|result| result.unwrap_or_else(|| input.to_string()))
    .map_err(|e| anyhow!("Formatting failed: {}", e))?;

    // Swap tokens back for their original protected lines
    let result = if !protected_lines.is_empty() {
        let mut restored = formatted;
        for (token, original) in &protected_lines {
            restored = restored.replace(token.as_str(), original.as_str());
        }
        restored
    } else {
        formatted
    };

    // Post-processing
    Ok(post_process_formatting(&result, options))
}

fn post_process_formatting(content: &str, options: &FormatterOptions) -> String {
    // Pre-allocate result buffer to avoid reallocations
    // Estimate ~5% expansion for formatting operations (bullet conversion, fence conversion, etc.)
    let estimated_capacity = content.len() + (content.len() / 20).max(64);
    let mut result = String::with_capacity(estimated_capacity);

    // Apply options that require line-by-line processing
    let convert_bullets = options.bullet_char == "+";
    let convert_fences = options.code_block_fence.starts_with('~');
    let adjust_indent = options.list_indent != DEFAULT_LIST_INDENT;

    if !convert_bullets && !convert_fences && !adjust_indent {
        // Fast path: just handle backslashes
        return convert_backslashes_to_spaces(content);
    }

    let mut in_code_block = false;

    for line in content.lines() {
        let trimmed = line.trim_start();

        // Handle code blocks
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            // Check for fence conversion
            if convert_fences {
                if let Some(rest) = trimmed.strip_prefix("```") {
                    let indent = line.len() - trimmed.len();
                    result.push_str(&" ".repeat(indent));
                    result.push_str("~~~");
                    result.push_str(rest);
                } else if trimmed.starts_with("~~~") && in_code_block {
                    // Closing fence
                    let indent = line.len() - trimmed.len();
                    result.push_str(&" ".repeat(indent));
                    result.push_str("```");
                } else {
                    result.push_str(line);
                }
            } else {
                result.push_str(line);
            }

            result.push('\n');
            in_code_block = !in_code_block;
            continue;
        }

        if in_code_block {
            result.push_str(line);
            result.push('\n');
            continue;
        }

        let mut processed_line = std::borrow::Cow::Borrowed(line);

        // 1. Bullet Conversion
        if convert_bullets && BULLET_RE.is_match(&processed_line) {
            let replaced = BULLET_RE.replace(&processed_line, "$1+ ").into_owned();
            processed_line = std::borrow::Cow::Owned(replaced);
        }

        // 2. Indent Adjustment
        if adjust_indent {
            let new_line = if let Some(caps) = UNORDERED_LIST_RE.captures(&processed_line) {
                let current_indent = caps.get(1).map_or(0, |m| m.len());
                (current_indent > 0).then(|| {
                    let list_level = current_indent / DEFAULT_LIST_INDENT;
                    let new_indent = list_level * options.list_indent;
                    let rest = &processed_line[current_indent..];
                    format!("{}{}", " ".repeat(new_indent), rest)
                })
            } else if let Some(caps) = ORDERED_LIST_RE.captures(&processed_line) {
                let current_indent = caps.get(1).map_or(0, |m| m.len());
                (current_indent > 0).then(|| {
                    let list_level = current_indent / DEFAULT_LIST_INDENT;
                    let new_indent = list_level * options.list_indent;
                    let rest = &processed_line[current_indent..];
                    format!("{}{}", " ".repeat(new_indent), rest)
                })
            } else {
                None
            };

            if let Some(nl) = new_line {
                processed_line = std::borrow::Cow::Owned(nl);
            }
        }

        result.push_str(&processed_line);
        result.push('\n');
    }

    if !content.ends_with('\n') && result.ends_with('\n') {
        result.pop();
    }

    convert_backslashes_to_spaces(&result)
}

fn convert_backslashes_to_spaces(content: &str) -> String {
    BACKSLASH_RE.replace_all(content, "${1}  ").to_string()
}
