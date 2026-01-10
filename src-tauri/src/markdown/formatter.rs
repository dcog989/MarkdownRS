use crate::markdown::config::MarkdownFlavor;
use dprint_plugin_markdown::configuration::{ConfigurationBuilder, TextWrap, UnorderedListKind};
use dprint_plugin_markdown::format_text;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormatterOptions {
    pub flavor: MarkdownFlavor,
    pub list_indent: usize,
    pub code_block_fence: String, // "```" or "~~~"
    pub bullet_char: String,      // "-", "*", or "+"
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

/// Format markdown content using dprint-plugin-markdown with post-processing
pub fn format_markdown(content: &str, options: &FormatterOptions) -> Result<String, String> {
    let mut builder = ConfigurationBuilder::new();

    // Map options to dprint configuration
    builder.text_wrap(TextWrap::Maintain);

    // Map bullet_char to UnorderedListKind (for base formatting)
    // Note: dprint only supports Dashes and Asterisks
    if let Some(char) = options.bullet_char.chars().next() {
        let kind = match char {
            '*' => UnorderedListKind::Asterisks,
            _ => UnorderedListKind::Dashes, // '-' and '+' both map to Dashes initially
        };
        builder.unordered_list_kind(kind);
    }

    let config = builder.build();

    // Format with dprint
    let formatted = format_text(content, &config, |tag, file_text, _line_width| {
        if let Some(_ext) = get_extension(tag) {
            // Potential future expansion for code block formatting
        }
        Ok(Some(file_text.to_string()))
    })
    .map(|result| result.unwrap_or_else(|| content.to_string()))
    .map_err(|e| format!("Formatting failed: {}", e))?;

    // Post-process to apply options not supported by dprint
    let processed = post_process_formatting(&formatted, options);

    Ok(processed)
}

/// Post-process the formatted markdown to apply additional options
fn post_process_formatting(content: &str, options: &FormatterOptions) -> String {
    let mut result = content.to_string();

    // Handle bullet char conversion to '+' if needed
    if options.bullet_char == "+" {
        result = convert_bullets_to_plus(&result);
    }

    // Handle code block fence conversion
    if options.code_block_fence.starts_with('~') {
        result = convert_code_fences(&result, "```", "~~~");
    }

    // Handle list indentation adjustment
    // dprint defaults to 2 spaces; we adjust if different via regex post-processing
    if options.list_indent != 2 {
        result = adjust_list_indentation(&result, options.list_indent);
    }

    // Handle whitespace normalization (limit consecutive blank lines)
    if options.normalize_whitespace {
        result = normalize_blank_lines(&result, options.max_blank_lines);
    }

    // Log warning if table alignment disabling was requested (not supported by current dprint engine)
    if !options.table_alignment {
        log::warn!("Table alignment disabling is not currently supported by the formatter.");
    }

    result
}

fn normalize_blank_lines(content: &str, max_blank_lines: usize) -> String {
    let threshold = max_blank_lines + 2;
    // Regex to find 'threshold' or more newlines (e.g. max=1 -> match 3+ newlines to reduce to 2)
    // Note: Assumes \n endings from dprint
    let re = Regex::new(&format!(r"\n{{{threshold},}}")).unwrap();
    let replacement = "\n".repeat(max_blank_lines + 1);
    re.replace_all(content, replacement.as_str()).to_string()
}

/// Convert bullet characters from - to +
fn convert_bullets_to_plus(content: &str) -> String {
    let mut result = String::new();
    let mut in_code_block = false;

    for line in content.lines() {
        // Track code block boundaries
        if line.trim_start().starts_with("```") || line.trim_start().starts_with("~~~") {
            in_code_block = !in_code_block;
            result.push_str(line);
            result.push('\n');
            continue;
        }

        if in_code_block {
            result.push_str(line);
            result.push('\n');
            continue;
        }

        // Convert unordered list bullets from - to +
        let re = Regex::new(r"^(\s*)- ").unwrap();
        if re.is_match(line) {
            let converted = re.replace(line, "$1+ ");
            result.push_str(&converted);
        } else {
            result.push_str(line);
        }
        result.push('\n');
    }

    // Remove trailing newline if original didn't have one
    if !content.ends_with('\n') && result.ends_with('\n') {
        result.pop();
    }

    result
}

/// Convert code fence markers
fn convert_code_fences(content: &str, from: &str, to: &str) -> String {
    let mut result = String::new();
    let mut in_code_block = false;

    for line in content.lines() {
        let trimmed = line.trim_start();

        // Check if this line starts a code block with the "from" fence
        if trimmed.starts_with(from) {
            let indent = line.len() - trimmed.len();
            let spaces = " ".repeat(indent);
            let rest = &trimmed[from.len()..];
            result.push_str(&format!("{}{}{}", spaces, to, rest));
            in_code_block = !in_code_block;
        } else if trimmed == from.trim() && in_code_block {
            // Closing fence
            let indent = line.len() - trimmed.len();
            let spaces = " ".repeat(indent);
            result.push_str(&format!("{}{}", spaces, to));
            in_code_block = false;
        } else {
            result.push_str(line);
        }
        result.push('\n');
    }

    // Remove trailing newline if original didn't have one
    if !content.ends_with('\n') && result.ends_with('\n') {
        result.pop();
    }

    result
}

/// Adjust list indentation to match the specified width
fn adjust_list_indentation(content: &str, target_indent: usize) -> String {
    let mut result = String::new();
    let mut in_code_block = false;

    for line in content.lines() {
        // Track code block boundaries
        if line.trim_start().starts_with("```") || line.trim_start().starts_with("~~~") {
            in_code_block = !in_code_block;
            result.push_str(line);
            result.push('\n');
            continue;
        }

        if in_code_block {
            result.push_str(line);
            result.push('\n');
            continue;
        }

        // Match list items (unordered and ordered)
        let unordered_re = Regex::new(r"^(\s*)[-*+] ").unwrap();
        let ordered_re = Regex::new(r"^(\s*)\d+\. ").unwrap();

        if let Some(caps) = unordered_re.captures(line) {
            let current_indent = caps.get(1).map_or(0, |m| m.as_str().len());
            let list_level = current_indent / 2; // Assume default 2-space indent
            let new_indent = list_level * target_indent;
            let new_spaces = " ".repeat(new_indent);
            let rest = &line[current_indent..];
            result.push_str(&format!("{}{}", new_spaces, rest));
        } else if let Some(caps) = ordered_re.captures(line) {
            let current_indent = caps.get(1).map_or(0, |m| m.as_str().len());
            let list_level = current_indent / 2; // Assume default 2-space indent
            let new_indent = list_level * target_indent;
            let new_spaces = " ".repeat(new_indent);
            let rest = &line[current_indent..];
            result.push_str(&format!("{}{}", new_spaces, rest));
        } else {
            result.push_str(line);
        }
        result.push('\n');
    }

    // Remove trailing newline if original didn't have one
    if !content.ends_with('\n') && result.ends_with('\n') {
        result.pop();
    }

    result
}

fn get_extension(tag: &str) -> Option<&str> {
    tag.split_whitespace().next()
}
