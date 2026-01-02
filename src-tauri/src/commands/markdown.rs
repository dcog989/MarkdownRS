use crate::markdown::config::MarkdownFlavor;
use crate::markdown::formatter::{self, FormatterOptions};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use crate::transforms::transform_text;

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

#[tauri::command]
pub async fn transform_text_content(
    content: String,
    operation: crate::transforms::TextOperation,
    indent_width: Option<usize>,
) -> Result<String, String> {
    transform_text(&content, operation, indent_width.unwrap_or(4)).map_err(|e| {
        log::error!("Failed to transform text with operation: {:?}", e);
        e
    })
}
