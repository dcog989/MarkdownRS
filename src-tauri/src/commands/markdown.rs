use crate::markdown::config::{self, MarkdownFlavor, ResolvedPaths};
use crate::markdown::formatter_rumdl;
use crate::markdown::linter::{self, LintDiagnostic};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use crate::markdown::toc;
use crate::state::AppState;
use crate::utils::{IntoTauriError, run_blocking};
use serde::Serialize;
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
    harper_enabled: Option<bool>,
    harper_linters: Option<std::collections::HashMap<String, bool>>,
    state: State<'_, AppState>,
) -> Result<Vec<LintDiagnostic>, String> {
    let ResolvedPaths {
        file_path: fp,
        project_root: pr,
    } = config::resolve_paths(file_path.as_deref(), &state);

    run_blocking("lint markdown", move || {
        let harper_options = crate::markdown::harper::HarperOptions {
            enabled: harper_enabled.unwrap_or(true),
            linter_overrides: harper_linters.unwrap_or_default(),
        };
        linter::lint_content(&content, fp.as_deref(), pr.as_deref(), &harper_options)
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
    Ok(MarkdownFlavor::all())
}

#[derive(Serialize)]
pub struct RumdlConfigRead {
    pub target_path: String,
    pub exists: bool,
    pub content: String,
    pub loaded_path: Option<String>,
}

#[tauri::command]
pub async fn read_rumdl_config(
    file_path: Option<String>,
    target: Option<String>,
    state: State<'_, AppState>,
) -> Result<RumdlConfigRead, String> {
    let ResolvedPaths {
        file_path: fp,
        project_root: pr,
    } = config::resolve_paths(file_path.as_deref(), &state);
    let scope = config::RumdlConfigScope::from_str(target.as_deref());

    crate::timed_info!("[Markdown]", "read_rumdl_config", {
        run_blocking("read rumdl config", move || {
            let resolved = config::resolve_config_target(fp.as_deref(), pr.as_deref(), scope);
            let exists = resolved.exists();
            let content = if exists {
                std::fs::read_to_string(&resolved)
                    .map_err(|e| format!("Failed to read rumdl config: {}", e))?
            } else {
                String::new()
            };
            let loaded_path = config::loaded_config_path(fp.as_deref(), pr.as_deref())
                .map(|p| p.to_string_lossy().to_string());
            Ok(RumdlConfigRead {
                target_path: resolved.to_string_lossy().to_string(),
                exists,
                content,
                loaded_path,
            })
        })
        .await
    })
}

#[tauri::command]
pub async fn write_rumdl_config(
    file_path: Option<String>,
    target: Option<String>,
    content: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ResolvedPaths {
        file_path: fp,
        project_root: pr,
    } = config::resolve_paths(file_path.as_deref(), &state);
    let scope = config::RumdlConfigScope::from_str(target.as_deref());

    crate::timed_info!("[Markdown]", "write_rumdl_config", {
        run_blocking("write rumdl config", move || {
            let pr = pr.unwrap_or_else(|| dirs::home_dir().unwrap_or_default());
            let resolved = config::resolve_config_target(fp.as_deref(), Some(&pr), scope);

            if let Some(dir) = resolved.parent() {
                std::fs::create_dir_all(dir)
                    .map_err(|e| format!("Failed to create config directory: {}", e))?;
            }

            config::validate_config_content(&content, &pr, &resolved)?;

            std::fs::write(&resolved, content)
                .map_err(|e| format!("Failed to write rumdl config: {}", e))?;

            Ok(resolved.to_string_lossy().to_string())
        })
        .await
    })
}
