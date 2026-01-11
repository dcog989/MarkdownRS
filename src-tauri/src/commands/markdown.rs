use crate::markdown::config::MarkdownFlavor;
use crate::markdown::formatter::{self, FormatterOptions};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use unicode_segmentation::UnicodeSegmentation;

#[tauri::command]
pub async fn compute_text_metrics(content: String) -> Result<(usize, usize, usize), String> {
    let line_count = content.lines().count();
    let word_count = content.unicode_words().count();
    let char_count = content.chars().count();
    Ok((line_count, word_count, char_count))
}

#[tauri::command]
pub async fn render_markdown(
    content: String,
    flavor: Option<String>,
) -> Result<RenderResult, String> {
    let markdown_flavor = flavor
        .and_then(|f| MarkdownFlavor::from_str(&f))
        .unwrap_or_default();

    let options = MarkdownOptions {
        flavor: markdown_flavor,
    };

    renderer::render_markdown(&content, options).map_err(|e| {
        log::error!("Failed to render markdown: {}", e);
        e
    })
}

#[tauri::command]
pub async fn format_markdown(
    content: String,
    flavor: Option<String>,
    list_indent: Option<usize>,
    bullet_char: Option<String>,
    code_block_fence: Option<String>,
    table_alignment: Option<bool>,
) -> Result<String, String> {
    let markdown_flavor = flavor
        .and_then(|f| MarkdownFlavor::from_str(&f))
        .unwrap_or_default();

    let options = FormatterOptions {
        flavor: markdown_flavor,
        list_indent: list_indent.unwrap_or(2),
        bullet_char: bullet_char.unwrap_or_else(|| "-".to_string()),
        code_block_fence: code_block_fence.unwrap_or_else(|| "```".to_string()),
        table_alignment: table_alignment.unwrap_or(true),
        normalize_whitespace: true,
        max_blank_lines: 2,
    };

    formatter::format_markdown(&content, &options).map_err(|e| {
        log::error!("Failed to format markdown: {}", e);
        e
    })
}

#[tauri::command]
pub async fn get_markdown_flavors() -> Result<Vec<String>, String> {
    Ok(vec!["commonmark".to_string(), "gfm".to_string()])
}
