use crate::markdown::config::{DEFAULT_LIST_INDENT, DEFAULT_MAX_BLANK_LINES, MarkdownFlavor};
use crate::markdown::formatter::{self, FormatterOptions};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use crate::utils::IntoTauriError;

#[tauri::command]
pub async fn compute_text_metrics(content: String) -> Result<(usize, usize, usize, usize), String> {
    Ok(renderer::calculate_text_metrics(&content))
}

#[tauri::command]
pub async fn render_markdown(
    content: String,
    flavor: Option<String>,
) -> Result<RenderResult, String> {
    let start = std::time::Instant::now();
    let content_size = content.len();

    let options = MarkdownOptions {
        flavor: MarkdownFlavor::from_option_str(flavor),
    };

    let result = tokio::task::spawn_blocking(move || renderer::render_markdown(&content, options))
        .await
        .map_err(|e| format!("Render task failed: {}", e))?
        .to_tauri_result();

    let duration = start.elapsed();
    log::info!(
        "[Markdown] render_markdown | duration={:?} | size={} bytes",
        duration,
        content_size
    );

    result
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn format_markdown(
    content: String,
    flavor: Option<String>,
    list_indent: Option<usize>,
    bullet_char: Option<String>,
    code_block_fence: Option<String>,
    emphasis_char: Option<String>,
    table_alignment: Option<bool>,
    max_blank_lines: Option<usize>,
) -> Result<String, String> {
    let start = std::time::Instant::now();
    let content_size = content.len();

    let options = FormatterOptions {
        flavor: MarkdownFlavor::from_option_str(flavor),
        list_indent: list_indent.unwrap_or(DEFAULT_LIST_INDENT),
        bullet_char: bullet_char.unwrap_or_else(|| "-".to_string()),
        code_block_fence: code_block_fence.unwrap_or_else(|| "```".to_string()),
        emphasis_char: emphasis_char.unwrap_or_else(|| "*".to_string()),
        table_alignment: table_alignment.unwrap_or(true),
        normalize_whitespace: true,
        max_blank_lines: max_blank_lines.unwrap_or(DEFAULT_MAX_BLANK_LINES),
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
        Ok(Ok(result)) => result.to_tauri_result(),
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
