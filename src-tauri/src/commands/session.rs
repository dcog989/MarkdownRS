use crate::db::{SessionData, TabData, TabState};
use crate::state::AppState;
use crate::utils::{handle_error, run_blocking};
use tauri::State;

#[tauri::command]
pub async fn save_session(
    state: State<'_, AppState>,
    mut active_tabs: Vec<TabState>,
    mut closed_tabs: Vec<TabState>,
) -> Result<(), String> {
    log::info!("[Rust] save_session called");
    log::info!("  Active tabs: {}", active_tabs.len());
    log::info!("  Closed tabs: {}", closed_tabs.len());

    let mut tabs_with_content = 0;
    for tab in &mut active_tabs {
        tab.normalize_newlines();
        if tab.content.is_some() {
            tabs_with_content += 1;
        }
    }
    log::info!("  Tabs with content to save: {}", tabs_with_content);

    closed_tabs
        .iter_mut()
        .for_each(|tab| tab.normalize_newlines());

    let active_len = active_tabs.len();
    let closed_len = closed_tabs.len();
    let db = state.db.clone();

    crate::timed_info!(
        "[Storage]",
        "save_session",
        {
            run_blocking("save session", move || {
                db.save_session(&active_tabs, &closed_tabs)
                    .map_err(|e| handle_error(Some("active and closed tabs"), "save session", e))
            })
            .await
        },
        active_tabs = active_len,
        closed_tabs = closed_len,
    )
}

#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> Result<SessionData, String> {
    log::info!("[Rust] restore_session called");

    // Seed recent files from existing session data (Backfill)
    if let Err(e) = state.db.seed_recent_files_from_history() {
        log::warn!("Failed to seed recent files: {}", e);
    }

    let db = state.db.clone();
    let (result, duration) = crate::timed!({
        run_blocking("restore session", move || {
            db.load_session()
                .map_err(|e| handle_error(Some("session data"), "restore session", e))
        })
        .await
    });

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
    let db = state.db.clone();
    let tab_id_clone = tab_id.clone();
    let (result, duration) = crate::timed!({
        run_blocking("load tab content", move || {
            db.load_tab_data(&tab_id_clone)
                .map_err(|e| handle_error(Some(&tab_id_clone), "load tab data", e))
        })
        .await
    });

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
    let db = state.db.clone();
    let freelist_count = run_blocking("check freelist count", move || {
        db.get_freelist_count()
            .map_err(|e| handle_error(Some("freelist count"), "check database", e))
    })
    .await?;

    if freelist_count > 0 {
        log::info!(
            "Vacuuming database: {} free pages to reclaim",
            freelist_count
        );
        let db2 = state.db.clone();
        run_blocking("vacuum database", move || {
            db2.incremental_vacuum(100)
                .map_err(|e| handle_error(Some("database"), "vacuum database", e))
        })
        .await?;
    } else {
        log::debug!("No free pages to reclaim in database");
    }

    Ok(())
}
