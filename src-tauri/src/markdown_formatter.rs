use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormatterOptions {
    pub list_indent: usize,
    pub code_block_fence: String, // "```" or "~~~"
    pub bullet_char: String,      // "-", "*", or "+"
    pub table_alignment: bool,
}

impl Default for FormatterOptions {
    fn default() -> Self {
        Self {
            list_indent: 2,
            code_block_fence: "```".to_string(),
            bullet_char: "-".to_string(),
            table_alignment: true,
        }
    }
}

/// Format markdown content with consistent styling
pub fn format_markdown(content: &str, options: &FormatterOptions) -> Result<String, String> {
    let mut formatted = content.to_string();

    // Normalize line endings
    formatted = formatted.replace("\r\n", "\n");

    // Remove trailing whitespace from lines
    formatted = formatted
        .lines()
        .map(|line| line.trim_end())
        .collect::<Vec<_>>()
        .join("\n");

    // Ensure single blank line between blocks (replace 3+ newlines with 2)
    while formatted.contains("\n\n\n") {
        formatted = formatted.replace("\n\n\n", "\n\n");
    }

    // Format headings
    formatted = format_headings(&formatted);

    // Format lists
    formatted = format_lists(&formatted, options);

    // Format code blocks
    formatted = format_code_blocks(&formatted, &options.code_block_fence);

    // Format tables
    if options.table_alignment {
        formatted = format_tables(&formatted);
    }

    // Ensure file ends with single newline
    formatted = formatted.trim_end().to_string() + "\n";

    Ok(formatted)
}

/// Format ATX-style headings (# Heading)
fn format_headings(content: &str) -> String {
    static HEADING_REGEX: OnceLock<Regex> = OnceLock::new();
    let re = HEADING_REGEX.get_or_init(|| Regex::new(r"^(#{1,6})\s*(.+?)(\s*#+)?\s*$").unwrap());

    content
        .lines()
        .map(|line| {
            // Match heading lines with optional trailing #
            if let Some(captures) = re.captures(line) {
                let level = captures.get(1).unwrap().as_str();
                let text = captures.get(2).unwrap().as_str().trim();
                // Consistent format: level + space + text (no trailing #)
                format!("{} {}", level, text)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Format list indentation
fn format_lists(content: &str, options: &FormatterOptions) -> String {
    static BULLET_REGEX: OnceLock<Regex> = OnceLock::new();
    static ORDERED_REGEX: OnceLock<Regex> = OnceLock::new();

    let bullet_re = BULLET_REGEX.get_or_init(|| Regex::new(r"^[-*+]\s+").unwrap());
    let ordered_re = ORDERED_REGEX.get_or_init(|| Regex::new(r"^\d+\.\s+").unwrap());

    let lines: Vec<&str> = content.lines().collect();
    let mut result = Vec::with_capacity(lines.len());
    let mut in_list = false;
    let mut list_level = 0;

    for line in lines {
        let trimmed = line.trim();

        if bullet_re.is_match(trimmed) {
            // Calculate indentation level
            let leading_spaces = line.len() - line.trim_start().len();
            list_level = leading_spaces / options.list_indent;
            in_list = true;

            let indent = " ".repeat(list_level * options.list_indent);
            let content = bullet_re.replace(trimmed, "").to_string();
            result.push(format!("{}{} {}", indent, options.bullet_char, content));
        } else if ordered_re.is_match(trimmed) {
            // Ordered list
            let leading_spaces = line.len() - line.trim_start().len();
            list_level = leading_spaces / options.list_indent;
            in_list = true;

            let indent = " ".repeat(list_level * options.list_indent);
            if let Some(captures) = ordered_re.captures(trimmed) {
                let number = captures
                    .get(0)
                    .unwrap()
                    .as_str()
                    .trim()
                    .trim_end_matches('.');
                let content = ordered_re.replace(trimmed, "").to_string();
                result.push(format!("{}{}. {}", indent, number, content));
            }
        } else if trimmed.is_empty() {
            result.push(String::new());
            in_list = false;
            list_level = 0;
        } else if in_list && line.starts_with(' ') {
            // Continuation of list item (indented content)
            let indent = " ".repeat((list_level + 1) * options.list_indent);
            result.push(format!("{}{}", indent, trimmed));
        } else {
            result.push(line.to_string());
            in_list = false;
            list_level = 0;
        }
    }

    result.join("\n")
}

/// Normalize code block fences
fn format_code_blocks(content: &str, preferred_fence: &str) -> String {
    static FENCE_REGEX: OnceLock<Regex> = OnceLock::new();
    let fence_re = FENCE_REGEX
        .get_or_init(|| Regex::new(r"(?m)^(```|~~~)(\w*)\n([\s\S]*?)^(```|~~~)").unwrap());

    fence_re
        .replace_all(content, |caps: &regex::Captures| {
            let lang = caps.get(2).map_or("", |m| m.as_str());
            let code = caps.get(3).map_or("", |m| m.as_str());
            format!("{}{}\n{}{}", preferred_fence, lang, code, preferred_fence)
        })
        .to_string()
}

/// Align table columns
fn format_tables(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let mut result = Vec::with_capacity(lines.len());
    let mut in_table = false;
    let mut table_lines = Vec::new();

    for line in lines {
        let trimmed = line.trim();

        // Detect table rows
        if trimmed.starts_with('|') && trimmed.ends_with('|') {
            in_table = true;
            table_lines.push(trimmed.to_string());
        } else if in_table {
            // End of table - format and add
            result.extend(align_table(&table_lines));
            table_lines.clear();
            in_table = false;
            result.push(line.to_string());
        } else {
            result.push(line.to_string());
        }
    }

    // Handle table at end of file
    if !table_lines.is_empty() {
        result.extend(align_table(&table_lines));
    }

    result.join("\n")
}

/// Align a table's columns
fn align_table(table_lines: &[String]) -> Vec<String> {
    if table_lines.len() < 2 {
        return table_lines.to_vec();
    }

    // Parse cells
    let rows: Vec<Vec<String>> = table_lines
        .iter()
        .map(|line| {
            line.split('|')
                .skip(1)
                .take_while(|_| true)
                .map(|cell| cell.trim().to_string())
                .collect::<Vec<_>>()
                .into_iter()
                .take(line.split('|').count() - 2)
                .collect()
        })
        .collect();

    // Calculate max width for each column
    let mut column_widths = Vec::new();
    for row in &rows {
        for (col_index, cell) in row.iter().enumerate() {
            if col_index >= column_widths.len() {
                column_widths.push(0);
            }
            column_widths[col_index] = column_widths[col_index].max(cell.len());
        }
    }

    // Format rows
    rows.iter()
        .enumerate()
        .map(|(row_index, row)| {
            let cells: Vec<String> = row
                .iter()
                .enumerate()
                .map(|(col_index, cell)| {
                    let width = column_widths.get(col_index).copied().unwrap_or(0);

                    // Check if this is a separator row
                    if row_index == 1 && cell.chars().all(|c| c == '-' || c == ':') {
                        let left_align = cell.starts_with(':');
                        let right_align = cell.ends_with(':');
                        let dashes = "-".repeat(width);

                        if left_align && right_align {
                            format!(":{dashes}:")
                        } else if left_align {
                            format!(":{dashes}")
                        } else if right_align {
                            format!("{dashes}:")
                        } else {
                            dashes
                        }
                    } else {
                        format!("{:<width$}", cell, width = width)
                    }
                })
                .collect();

            format!("| {} |", cells.join(" | "))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_line_endings() {
        let input = "line1\r\nline2\r\nline3";
        let options = FormatterOptions::default();
        let result = format_markdown(input, &options).unwrap();
        assert!(!result.contains("\r\n"));
        assert!(result.contains("\n"));
    }

    #[test]
    fn test_heading_formatting() {
        let input = "# Heading   \n##   Another Heading   ##\n";
        let expected_contains = vec!["# Heading", "## Another Heading"];
        let formatted = format_headings(input);
        for expected in expected_contains {
            assert!(formatted.contains(expected));
        }
    }

    #[test]
    fn test_list_formatting() {
        let input = "* item1\n* item2\n+ item3";
        let options = FormatterOptions {
            bullet_char: "-".to_string(),
            ..Default::default()
        };
        let formatted = format_lists(input, &options);
        assert!(formatted.contains("- item1"));
        assert!(formatted.contains("- item2"));
        assert!(formatted.contains("- item3"));
    }

    #[test]
    fn test_code_fence_normalization() {
        let input = "~~~js\ncode\n~~~";
        let formatted = format_code_blocks(input, "```");
        assert!(formatted.contains("```js"));
        assert!(!formatted.contains("~~~"));
    }

    #[test]
    fn test_file_ends_with_newline() {
        let input = "content";
        let options = FormatterOptions::default();
        let result = format_markdown(input, &options).unwrap();
        assert!(result.ends_with('\n'));
    }
}
