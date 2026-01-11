use crate::db::{SessionData, TabData, TabState};
use crate::state::AppState;
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
        if let Some(content) = &mut tab.content {
            tabs_with_content += 1;
            log::debug!("  Tab '{}' has content: {} bytes", tab.title, content.len());
            if content.contains("\r\n") {
                *content = content.replace("\r\n", "\n");
            }
        } else {
            log::debug!("  Tab '{}' has no content (metadata only)", tab.title);
        }
    }
    log::info!("  Tabs with content to save: {}", tabs_with_content);
    
    for tab in &mut closed_tabs {
        if let Some(content) = &mut tab.content {
            if content.contains("\r\n") {
                *content = content.replace("\r\n", "\n");
            }
        }
    }

    let mut db = state.db.lock().await;
    let result = db.save_session(&active_tabs, &closed_tabs).map_err(|e| {
        log::error!("Failed to save session: {}", e);
        format!("Failed to save session: {}", e)
    });
    
    if result.is_ok() {
        log::info!("[Rust] Session saved successfully");
    }
    
    result
}

#[tauri::command]
pub async fn restore_session(state: State<'_, AppState>) -> Result<SessionData, String> {
    log::info!("[Rust] restore_session called");
    let db = state.db.lock().await;
    let result = db.load_session().map_err(|e| {
        log::error!("Failed to restore session: {}", e);
        format!("Failed to restore session: {}", e)
    });
    
    if let Ok(ref session) = result {
        log::info!("  Loaded active tabs: {}", session.active_tabs.len());
        log::info!("  Loaded closed tabs: {}", session.closed_tabs.len());
        let tabs_with_content = session.active_tabs.iter().filter(|t| t.content.is_some()).count();
        log::info!("  Active tabs with content: {}", tabs_with_content);
    }
    
    result
}

#[tauri::command]
pub async fn load_tab_content(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<TabData, String> {
    let db = state.db.lock().await;
    db.load_tab_data(&tab_id).map_err(|e| {
        log::error!("Failed to load tab data for {}: {}", tab_id, e);
        format!("Failed to load tab data: {}", e)
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
