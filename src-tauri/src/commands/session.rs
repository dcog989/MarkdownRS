use crate::db::{SessionData, TabState};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn save_session(
    state: State<'_, AppState>,
    mut active_tabs: Vec<TabState>,
    mut closed_tabs: Vec<TabState>,
) -> Result<(), String> {
    for tab in &mut active_tabs {
        if let Some(content) = &mut tab.content {
            if content.contains("\r\n") {
                *content = content.replace("\r\n", "\n");
            }
        }
    }
    for tab in &mut closed_tabs {
        if let Some(content) = &mut tab.content {
            if content.contains("\r\n") {
                *content = content.replace("\r\n", "\n");
            }
        }
    }

    let mut db = state.db.lock().await;
    db.save_session(&active_tabs, &closed_tabs).map_err(|e| {
        log::error!("Failed to save session: {}", e);
        format!("Failed to save session: {}", e)
    })
}

#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> Result<SessionData, String> {
    let db = state.db.lock().await;
    // Use optimized loading without content by default
    db.load_session().map_err(|e| {
        log::error!("Failed to restore session: {}", e);
        format!("Failed to restore session: {}", e)
    })
}

#[tauri::command]
pub async fn load_tab_content(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<Option<String>, String> {
    let db = state.db.lock().await;
    db.load_tab_content(&tab_id).map_err(|e| {
        log::error!("Failed to load tab content for {}: {}", tab_id, e);
        format!("Failed to load tab content: {}", e)
    })
}

#[tauri::command]
pub async fn vacuum_database(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;

    // Check if there are any free pages to reclaim
    let freelist_count = db.get_freelist_count().map_err(|e| {
        log::error!("Failed to get freelist count: {}", e);
        format!("Failed to check database: {}", e)
    })?;

    if freelist_count > 0 {
        log::info!(
            "Vacuuming database: {} free pages to reclaim",
            freelist_count
        );
        // Reclaim up to 100 pages at a time to avoid blocking
        db.incremental_vacuum(100).map_err(|e| {
            log::error!("Failed to vacuum database: {}", e);
            format!("Failed to vacuum database: {}", e)
        })?;
    } else {
        log::debug!("No free pages to reclaim in database");
    }

    Ok(())
}
