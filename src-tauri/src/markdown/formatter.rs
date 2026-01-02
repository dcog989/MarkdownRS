use crate::markdown::config::MarkdownFlavor;
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
    builder.text_wrap(TextWrap::Maintain);

    if let Some(char) = options.bullet_char.chars().next() {
        let kind = match char {
            '*' => UnorderedListKind::Asterisks,
            _ => UnorderedListKind::Dashes,
        };
        builder.unordered_list_kind(kind);
    }

    let config = builder.build();

    format_text(content, &config, |tag, file_text, _line_width| {
        if let Some(_ext) = get_extension(tag) {
            // Potential future expansion
        }
        Ok(Some(file_text.to_string()))
    })
    .map(|result| result.unwrap_or_else(|| content.to_string()))
    .map_err(|e| format!("Formatting failed: {}", e))
}

fn get_extension(tag: &str) -> Option<&str> {
    tag.split_whitespace().next()
}
