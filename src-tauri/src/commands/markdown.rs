use crate::markdown::config::MarkdownFlavor;
use crate::markdown::formatter_rumdl;
use crate::markdown::linter::{self, LintDiagnostic};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use crate::markdown::toc;
use crate::state::AppState;
use crate::utils::IntoTauriError;
use std::path::PathBuf;
use tauri::State;

fn resolve_project_root(state: &AppState) -> Option<PathBuf> {
    state
        .settings_cache
        .lock()
        .ok()
        .and_then(|cache| cache.clone())
        .and_then(|settings| {
            settings
                .get("workspaceRoot")
                .and_then(|v| v.as_str())
                .map(PathBuf::from)
        })
}

fn resolve_file_path(file_path: Option<&str>) -> Option<PathBuf> {
    file_path.map(PathBuf::from)
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
    file_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let start = std::time::Instant::now();
    let content_size = content.len();

    let fp: Option<PathBuf> = resolve_file_path(file_path.as_deref());
    let pr: Option<PathBuf> = resolve_project_root(&state);

    let result = tokio::task::spawn_blocking(move || {
        formatter_rumdl::format_markdown(&content, fp.as_deref(), pr.as_deref())
    })
    .await
    .map_err(|e| format!("Formatter task failed: {}", e))?;

    let duration = start.elapsed();
    log::info!(
        "[Markdown] format_markdown | duration={:?} | size={} bytes",
        duration,
        content_size
    );

    result
}

#[tauri::command]
pub async fn lint_markdown(
    content: String,
    file_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<LintDiagnostic>, String> {
    let start = std::time::Instant::now();
    let content_size = content.len();

    let fp: Option<PathBuf> = resolve_file_path(file_path.as_deref());
    let pr: Option<PathBuf> = resolve_project_root(&state);

    let result = tokio::task::spawn_blocking(move || {
        linter::lint_content(&content, fp.as_deref(), pr.as_deref())
    })
    .await
    .map_err(|e| format!("Lint task failed: {}", e))?;

    let duration = start.elapsed();
    log::info!(
        "[Markdown] lint_markdown | duration={:?} | size={} bytes",
        duration,
        content_size
    );

    result
}

#[tauri::command]
pub async fn get_markdown_flavors() -> Result<Vec<String>, String> {
    Ok(vec!["commonmark".to_string(), "gfm".to_string()])
}
