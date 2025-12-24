use crate::markdown_config::MarkdownFlavor;
use dprint_plugin_markdown::configuration::{ConfigurationBuilder, TextWrap, UnorderedListKind};
use dprint_plugin_markdown::format_text;
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

/// Format markdown content using dprint-plugin-markdown
pub fn format_markdown(content: &str, options: &FormatterOptions) -> Result<String, String> {
    let mut builder = ConfigurationBuilder::new();

    // Map options to dprint configuration
    // Text Wrap: Maintain existing (soft wrap handled by editor)
    builder.text_wrap(TextWrap::Maintain);

    // List Character - Map char to UnorderedListKind
    // Note: dprint only supports Dashes and Asterisks for uniformity.
    if let Some(char) = options.bullet_char.chars().next() {
        let kind = match char {
            '*' => UnorderedListKind::Asterisks,
            _ => UnorderedListKind::Dashes, // Fallback + to - as dprint doesn't support + style enforcement
        };
        builder.unordered_list_kind(kind);
    }

    // Code Block styling (dprint is opinionated, but respects fence char somewhat)
    // Note: dprint defaults to backticks.

    // GFM / CommonMark
    // dprint is primarily GFM compliant.

    let config = builder.build();

    // Format the text
    // The closure is used to format code blocks (e.g. rust code inside markdown).
    // We pass through the content unchanged to avoid needing heavy language parsers.
    format_text(content, &config, |tag, file_text, _line_width| {
        // Tag contains info like "rust", "js".
        // In a full IDE we would format this too, but for a lightweight editor,
        // we leave inner code blocks alone to ensure speed and stability.
        if let Some(_ext) = get_extension(tag) {
            // Potential future expansion: Integrate formatters for specific languages
            // For now, return Ok(None) to signal "no change"
        }
        Ok(Some(file_text.to_string()))
    })
    .map(|result| result.unwrap_or_else(|| content.to_string())) // Use original if no changes
    .map_err(|e| format!("Formatting failed: {}", e))
}

fn get_extension(tag: &str) -> Option<&str> {
    tag.split_whitespace().next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dprint_basic_formatting() {
        let input = "#   Title\n\n  * list 1\n  * list 2\n";
        let options = FormatterOptions {
            bullet_char: "-".to_string(),
            ..Default::default()
        };
        let result = format_markdown(input, &options).unwrap();

        assert!(result.contains("# Title")); // Fixes heading spaces
        assert!(result.contains("- list 1")); // Fixes bullet char
    }

    #[test]
    fn test_table_formatting() {
        let input = "|col1|col2|\n|---|---|\n|val1|val2|";
        let options = FormatterOptions::default();
        let result = format_markdown(input, &options).unwrap();

        // dprint adds spaces for readability
        assert!(result.contains("| col1 | col2 |"));
    }

    #[test]
    fn test_no_aggressive_escaping() {
        let input = "Here is an exclamation! And a [link](url).";
        let options = FormatterOptions::default();
        let result = format_markdown(input, &options).unwrap();

        // Should NOT escape the exclamation mark
        assert!(!result.contains(r"\!"));
        assert!(result.contains("exclamation!"));
    }
}
