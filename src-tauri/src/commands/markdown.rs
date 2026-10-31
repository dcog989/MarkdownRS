use crate::markdown::config::{self, MarkdownFlavor, ResolvedPaths};
use crate::markdown::formatter_rumdl;
use crate::markdown::linter::{self, LintDiagnostic};
use crate::markdown::renderer::{self, MarkdownOptions, RenderResult};
use crate::markdown::toc;
use crate::state::AppState;
use crate::utils::{IntoTauriError, run_blocking};
use serde::Serialize;
use std::path::Path;
use tauri::State;

#[tauri::command]
pub async fn render_markdown(content: String, flavor: Option<String>) -> Result<RenderResult, String> {
    let content_size = content.len();

    let options = MarkdownOptions {
        flavor: MarkdownFlavor::from_option_str(flavor),
    };

    crate::timed_debug!(
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

    crate::timed_debug!(
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
            let path = config::loaded_config_path(fp.as_deref(), pr.as_deref());
            Ok(path.map(|p| p.to_string_lossy().to_string()))
        })
        .await
    })
}

#[derive(Serialize)]
pub struct RumdlConfigRead {
    pub target_path: String,
    pub exists: bool,
    pub content: String,
    pub loaded_path: Option<String>,
}

/// Project scope needs a directory to anchor to: the document's own directory or
/// the workspace root. Without either, the target silently becomes
/// `$HOME/.rumdl.toml`, which then applies as a user-level config to every
/// project.
fn ensure_project_scope_anchor(
    scope: config::RumdlConfigScope,
    file_path: Option<&Path>,
    project_root: Option<&Path>,
) -> Result<(), String> {
    if scope == config::RumdlConfigScope::Project && file_path.is_none() && project_root.is_none() {
        return Err("Project config needs an open folder or a saved file".to_string());
    }
    Ok(())
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
    ensure_project_scope_anchor(scope, fp.as_deref(), pr.as_deref())?;

    crate::timed_info!("[Markdown]", "read_rumdl_config", {
        run_blocking("read rumdl config", move || {
            let resolved = config::resolve_config_target(fp.as_deref(), pr.as_deref(), scope);
            let exists = resolved.exists();
            let content = if exists {
                std::fs::read_to_string(&resolved).map_err(|e| format!("Failed to read rumdl config: {}", e))?
            } else {
                String::new()
            };
            let loaded_path =
                config::loaded_config_path(fp.as_deref(), pr.as_deref()).map(|p| p.to_string_lossy().to_string());
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
    ensure_project_scope_anchor(scope, fp.as_deref(), pr.as_deref())?;

    crate::timed_info!("[Markdown]", "write_rumdl_config", {
        let (resolved, content) = run_blocking("validate rumdl config", move || {
            let resolved = config::resolve_config_target(fp.as_deref(), pr.as_deref(), scope);
            let validation_root = pr.as_deref().or_else(|| resolved.parent()).unwrap_or(Path::new("."));

            if let Some(dir) = resolved.parent() {
                std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create config directory: {}", e))?;
            }

            config::validate_config_content(&content, validation_root, &resolved)?;

            Ok((resolved, content))
        })
        .await?;

        crate::utils::atomic_write(&resolved, content.as_bytes())
            .await
            .map_err(|e| format!("Failed to write rumdl config: {}", e))?;

        Ok(resolved.to_string_lossy().to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::ensure_project_scope_anchor;
    use crate::markdown::config::RumdlConfigScope;
    use std::path::Path;

    #[test]
    fn project_scope_needs_a_file_or_a_workspace_root() {
        assert!(ensure_project_scope_anchor(RumdlConfigScope::Project, None, None).is_err());
        assert!(ensure_project_scope_anchor(RumdlConfigScope::Project, Some(Path::new("/a/b.md")), None).is_ok());
        assert!(ensure_project_scope_anchor(RumdlConfigScope::Project, None, Some(Path::new("/work"))).is_ok());
    }

    #[test]
    fn user_scope_needs_no_anchor() {
        assert!(ensure_project_scope_anchor(RumdlConfigScope::User, None, None).is_ok());
    }
}
