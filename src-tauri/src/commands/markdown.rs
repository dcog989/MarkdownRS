use crate::markdown::config::MarkdownFlavor;
use crate::markdown::formatter::{self, FormatterOptions};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use unicode_segmentation::UnicodeSegmentation;

#[tauri::command]
pub async fn compute_text_metrics(content: String) -> Result<(usize, usize, usize, usize), String> {
    let lines: Vec<&str> = content.lines().collect();
    let line_count = lines.len();
    let word_count = content.unicode_words().count();
    let char_count = content.chars().count();
    let widest_column = lines.iter().map(|l| l.chars().count()).max().unwrap_or(0);
    Ok((line_count, word_count, char_count, widest_column))
}

#[tauri::command]
pub async fn render_markdown(
    content: String,
    flavor: Option<String>,
) -> Result<RenderResult, String> {
    let start = std::time::Instant::now();
    let content_size = content.len();

    let markdown_flavor = flavor
        .and_then(|f| MarkdownFlavor::from_str(&f))
        .unwrap_or_default();

    let options = MarkdownOptions {
        flavor: markdown_flavor,
    };

    let result = tokio::task::spawn_blocking(move || {
        renderer::render_markdown(&content, options).map_err(|e| {
            log::error!("Failed to render markdown: {}", e);
            e
        })
    })
    .await
    .map_err(|e| format!("Render task failed: {}", e))?;

    let duration = start.elapsed();
    log::info!(
        "[Markdown] render_markdown | duration={:?} | size={} bytes",
        duration,
        content_size
    );

    result
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
    let start = std::time::Instant::now();
    let content_size = content.len();

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

    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::Builder::new()
        .name("markdown-formatter".into())
        .stack_size(16 * 1024 * 1024)
        .spawn(move || {
            let result = formatter::format_markdown(&content, &options);
            let _ = tx.send(result);
        })
        .map_err(|e| format!("Failed to spawn formatter thread: {}", e))?;

    let result = match tokio::task::spawn_blocking(move || rx.recv()).await {
        Ok(Ok(result)) => result.map_err(|e| {
            log::error!("Failed to format markdown: {}", e);
            e
        }),
        Ok(Err(_)) => Err("Formatter thread panicked or disconnected".to_string()),
        Err(e) => Err(format!("Formatter task join error: {}", e)),
    };

    let duration = start.elapsed();
    log::info!(
        "[Markdown] format_markdown | duration={:?} | size={} bytes",
        duration,
        content_size
    );

    result
}

#[tauri::command]
pub async fn get_markdown_flavors() -> Result<Vec<String>, String> {
    Ok(vec!["commonmark".to_string(), "gfm".to_string()])
}
