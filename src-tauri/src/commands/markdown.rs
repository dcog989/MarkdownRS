use crate::markdown::config::{DEFAULT_LIST_INDENT, MarkdownFlavor};
use crate::markdown::formatter::{self, FormatterOptions};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use crate::markdown::toc;
use crate::utils::IntoTauriError;

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
pub async fn generate_document_toc(content: String) -> Result<String, String> {
    let start = std::time::Instant::now();
    let content_size = content.len();

    let result = tokio::task::spawn_blocking(move || toc::generate_document_toc(&content))
        .await
        .map_err(|e| format!("TOC generation task failed: {}", e))?;

    let duration = start.elapsed();
    log::info!(
        "[Markdown] generate_document_toc | duration={:?} | size={} bytes",
        duration,
        content_size
    );

    Ok(result)
}

#[tauri::command]
pub async fn format_markdown(
    content: String,
    flavor: Option<String>,
    list_indent: Option<usize>,
    bullet_char: Option<String>,
    code_block_fence: Option<String>,
    emphasis_char: Option<String>,
) -> Result<String, String> {
    let start = std::time::Instant::now();
    let content_size = content.len();

    let options = FormatterOptions {
        flavor: MarkdownFlavor::from_option_str(flavor),
        list_indent: list_indent.unwrap_or(DEFAULT_LIST_INDENT),
        bullet_char: bullet_char.unwrap_or_else(|| "-".to_string()),
        code_block_fence: code_block_fence.unwrap_or_else(|| "```".to_string()),
        emphasis_char: emphasis_char.unwrap_or_else(|| "*".to_string()),
    };

    // The formatter is CPU-bound and may use significant stack space; run it on
    // the blocking thread pool so it cannot stall async tasks.
    let result =
        tokio::task::spawn_blocking(move || formatter::format_markdown(&content, &options))
            .await
            .map_err(|e| format!("Formatter task failed: {}", e))?
            .to_tauri_result();

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
