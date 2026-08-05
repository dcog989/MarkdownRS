use crate::markdown::config::{self, MarkdownFlavor, ResolvedPaths};
use crate::markdown::formatter_rumdl;
use crate::markdown::linter::{self, LintDiagnostic};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use crate::markdown::toc;
use crate::state::AppState;
use crate::utils::{IntoTauriError, run_blocking};
use tauri::State;

#[tauri::command]
pub async fn render_markdown(
    content: String,
    flavor: Option<String>,
) -> Result<RenderResult, String> {
    let content_size = content.len();

    let options = MarkdownOptions {
        flavor: MarkdownFlavor::from_option_str(flavor),
    };

    crate::timed_info!(
        "[Markdown]",
        "render_markdown",
        {
            run_blocking("render markdown", move || {
                renderer::render_markdown(&content, options).to_tauri_result()
            })
            .await
        },
        size = content_size,
    )
}

#[tauri::command]
pub async fn generate_document_toc(
    content: String,
    headings: Option<Vec<crate::markdown::HeadingEntry>>,
) -> Result<String, String> {
    let content_size = content.len();

    crate::timed_info!(
        "[Markdown]",
        "generate_document_toc",
        {
            run_blocking("generate TOC", move || {
                Ok(toc::generate_document_toc_with_headings(&content, headings))
            })
            .await
        },
        size = content_size,
    )
}

#[tauri::command]
pub async fn format_markdown(
    content: String,
    file_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let content_size = content.len();

    let ResolvedPaths {
        file_path: fp,
        project_root: pr,
    } = config::resolve_paths(file_path.as_deref(), &state);

    crate::timed_info!(
        "[Markdown]",
        "format_markdown",
        {
            run_blocking("format markdown", move || {
                formatter_rumdl::format_markdown(&content, fp.as_deref(), pr.as_deref())
            })
            .await
        },
        size = content_size,
    )
}

#[tauri::command]
pub async fn lint_markdown(
    content: String,
    file_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<LintDiagnostic>, String> {
    let ResolvedPaths {
        file_path: fp,
        project_root: pr,
    } = config::resolve_paths(file_path.as_deref(), &state);

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
    let ResolvedPaths {
        file_path: fp,
        project_root: pr,
    } = config::resolve_paths(file_path.as_deref(), &state);

    crate::timed_info!("[Markdown]", "get_rumdl_config_path", {
        run_blocking("discover rumdl config", move || {
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
        .await
    })
}

#[tauri::command]
pub async fn get_markdown_flavors() -> Result<Vec<String>, String> {
    Ok(MarkdownFlavor::all()
        .into_iter()
        .map(|s| s.to_string())
        .collect())
}
