use crate::markdown::config::MarkdownFlavor;
use dprint_plugin_markdown::configuration::{ConfigurationBuilder, TextWrap, UnorderedListKind};
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormatterOptions {
    pub flavor: MarkdownFlavor,
    pub list_indent: usize,
    pub code_block_fence: String,
    pub bullet_char: String,
    pub table_alignment: bool,
    pub normalize_whitespace: bool,
    pub max_blank_lines: usize,
}

impl Default for FormatterOptions {
    fn default() -> Self {
        Self {
            flavor: MarkdownFlavor::default(),
            list_indent: 2,
            code_block_fence: "```".to_string(),
            bullet_char: "-".to_string(),
            table_alignment: true,
            normalize_whitespace: true,
            max_blank_lines: 1,
        }
    }
}

pub fn format_markdown(content: &str, options: &FormatterOptions) -> Result<String, String> {
    let mut builder = ConfigurationBuilder::new();
    builder.text_wrap(TextWrap::Maintain);

    if let Some(char) = options.bullet_char.chars().next() {
        let kind = match char {
            '*' => UnorderedListKind::Asterisks,
            _ => UnorderedListKind::Dashes,
        };
        builder.unordered_list_kind(kind);
    }

    let config = builder.build();

    // dprint formatting
    let formatted = format_text(content, &config, |_, file_text, _| {
        Ok(Some(file_text.to_string()))
    })
    .map(|result| result.unwrap_or_else(|| content.to_string()))
    .map_err(|e| format!("Formatting failed: {}", e))?;

    // Post-processing
    Ok(post_process_formatting(&formatted, options))
}

fn post_process_formatting(content: &str, options: &FormatterOptions) -> String {
    // Pre-allocate result buffer to avoid reallocations
    let mut result = String::with_capacity(content.len() + 1024);

    // Apply options that require line-by-line processing
    let convert_bullets = options.bullet_char == "+";
    let convert_fences = options.code_block_fence.starts_with('~');
    let adjust_indent = options.list_indent != 2;

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
                if trimmed.starts_with("```") {
                    let indent = line.len() - trimmed.len();
                    result.push_str(&" ".repeat(indent));
                    result.push_str("~~~");
                    result.push_str(&trimmed[3..]);
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
        if convert_bullets {
            if BULLET_RE.is_match(&processed_line) {
                let replaced = BULLET_RE.replace(&processed_line, "$1+ ").into_owned();
                processed_line = std::borrow::Cow::Owned(replaced);
            }
        }

        // 2. Indent Adjustment
        if adjust_indent {
            // Check for list items
            // We need to calculate the new string in a block to ensure the borrow of `processed_line`
            // by `captures` is dropped before we assign to `processed_line`.
            let new_line_opt = if let Some(caps) = UNORDERED_LIST_RE.captures(&processed_line) {
                let current_indent = caps.get(1).map_or(0, |m| m.len());
                if current_indent > 0 {
                    let list_level = current_indent / 2;
                    let new_indent = list_level * options.list_indent;
                    let rest = &processed_line[current_indent..];
                    Some(format!("{}{}", " ".repeat(new_indent), rest))
                } else {
                    None
                }
            } else if let Some(caps) = ORDERED_LIST_RE.captures(&processed_line) {
                let current_indent = caps.get(1).map_or(0, |m| m.len());
                if current_indent > 0 {
                    let list_level = current_indent / 2;
                    let new_indent = list_level * options.list_indent;
                    let rest = &processed_line[current_indent..];
                    Some(format!("{}{}", " ".repeat(new_indent), rest))
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(nl) = new_line_opt {
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
