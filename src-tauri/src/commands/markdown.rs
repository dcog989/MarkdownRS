use crate::markdown::config;
use crate::markdown::config::MarkdownFlavor;
use crate::markdown::formatter_rumdl;
use crate::markdown::linter::{self, LintDiagnostic};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use crate::markdown::toc;
use crate::state::AppState;
use crate::utils::{IntoTauriError, run_blocking};
use std::path::PathBuf;
use tauri::State;

fn resolve_project_root(state: &AppState) -> Option<PathBuf> {
    state.project_root.lock().ok().and_then(|r| r.clone())
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

    let result = run_blocking("render markdown", move || {
        renderer::render_markdown(&content, options).to_tauri_result()
    })
    .await;

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

    let result = run_blocking("generate TOC", move || {
        Ok(toc::generate_document_toc(&content))
    })
    .await?;

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

    let result = run_blocking("format markdown", move || {
        formatter_rumdl::format_markdown(&content, fp.as_deref(), pr.as_deref())
    })
    .await;

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
    let fp: Option<PathBuf> = resolve_file_path(file_path.as_deref());
    let pr: Option<PathBuf> = resolve_project_root(&state);

    run_blocking("lint markdown", move || {
        linter::lint_content(&content, fp.as_deref(), pr.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn get_rumdl_config_path(
    file_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let start = std::time::Instant::now();

    let fp: Option<PathBuf> = resolve_file_path(file_path.as_deref());
    let pr: Option<PathBuf> = resolve_project_root(&state);

    let result = run_blocking("discover rumdl config", move || {
        let path = match (fp, pr) {
            (Some(fp), Some(pr)) => {
                let file_dir = fp
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| pr.clone());
                config::discover_config_path(&file_dir, &pr)
            },
            _ => config::discover_user_config_path(),
        };
        Ok(path.map(|p| p.to_string_lossy().to_string()))
    })
    .await;

    let duration = start.elapsed();
    log::info!("[Markdown] get_rumdl_config_path | duration={:?}", duration);

    result
}

#[tauri::command]
pub async fn get_markdown_flavors() -> Result<Vec<String>, String> {
    Ok(vec!["commonmark".to_string(), "gfm".to_string()])
}
