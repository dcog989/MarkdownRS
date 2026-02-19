use crate::db::{SessionData, TabData, TabState};
use crate::state::AppState;
use crate::utils::handle_db_error;
use tauri::State;

#[tauri::command]
pub async fn save_session(
    state: State<'_, AppState>,
    mut active_tabs: Vec<TabState>,
    mut closed_tabs: Vec<TabState>,
) -> Result<(), String> {
    let start = std::time::Instant::now();

    log::info!("[Rust] save_session called");
    log::info!("  Active tabs: {}", active_tabs.len());
    log::info!("  Closed tabs: {}", closed_tabs.len());

    let mut tabs_with_content = 0;
    for tab in &mut active_tabs {
        if let Some(_content) = &tab.content {
            tabs_with_content += 1;
        }
        tab.normalize_newlines();
    }
    log::info!("  Tabs with content to save: {}", tabs_with_content);

    for tab in &mut closed_tabs {
        tab.normalize_newlines();
    }

    let result = state
        .db
        .save_session(&active_tabs, &closed_tabs)
        .map_err(|e| handle_db_error("save session", "active and closed tabs", e));

    let duration = start.elapsed();
    if result.is_ok() {
        log::info!(
            "[Storage] save_session | duration={:?} | active_tabs={} | closed_tabs={}",
            duration,
            active_tabs.len(),
            closed_tabs.len()
        );
    }

    result
}

#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> Result<SessionData, String> {
    let start = std::time::Instant::now();

    log::info!("[Rust] restore_session called");

    // Seed recent files from existing session data (Backfill)
    if let Err(e) = state.db.seed_recent_files_from_history() {
        log::warn!("Failed to seed recent files: {}", e);
    }

    let result = state
        .db
        .load_session()
        .map_err(|e| handle_db_error("restore session", "session data", e));

    let duration = start.elapsed();
    if let Ok(ref session) = result {
        let tabs_with_content = session
            .active_tabs
            .iter()
            .filter(|t| t.content.is_some())
            .count();
        log::info!(
            "[Storage] restore_session | duration={:?} | active_tabs={} | closed_tabs={} | with_content={}",
            duration,
            session.active_tabs.len(),
            session.closed_tabs.len(),
            tabs_with_content
        );
    }

    result
}

#[tauri::command]
pub async fn load_tab_content(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<TabData, String> {
    let start = std::time::Instant::now();

    let result = state
        .db
        .load_tab_data(&tab_id)
        .map_err(|e| handle_db_error("load tab data", &tab_id, e));

    let duration = start.elapsed();
    if let Ok(ref tab_data) = result {
        log::info!(
            "[Storage] load_tab_content | duration={:?} | tab_id={} | size={} bytes",
            duration,
            tab_id,
            tab_data.content.as_ref().map(|s| s.len()).unwrap_or(0)
        );
    }

    result
}

#[tauri::command]
pub async fn vacuum_database(state: State<'_, AppState>) -> Result<(), String> {
    let freelist_count = state
        .db
        .get_freelist_count()
        .map_err(|e| handle_db_error("check database", "freelist count", e))?;

    if freelist_count > 0 {
        log::info!(
            "Vacuuming database: {} free pages to reclaim",
            freelist_count
        );
        state
            .db
            .incremental_vacuum(100)
            .map_err(|e| handle_db_error("vacuum database", "database", e))?;
    } else {
        log::debug!("No free pages to reclaim in database");
    }

    Ok(())
}
