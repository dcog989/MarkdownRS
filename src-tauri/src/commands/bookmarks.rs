use crate::db::Bookmark;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn add_bookmark(state: State<'_, AppState>, bookmark: Bookmark) -> Result<(), String> {
    let db = state.db.lock().await;
    db.add_bookmark(&bookmark).map_err(|e| {
        log::error!("Failed to add bookmark '{}': {}", bookmark.path, e);
        format!("Failed to add bookmark: {}", e)
    })
}

#[tauri::command]
pub async fn get_all_bookmarks(state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> {
    let db = state.db.lock().await;
    db.get_all_bookmarks().map_err(|e| {
        log::error!("Failed to retrieve bookmarks: {}", e);
        format!("Failed to retrieve bookmarks: {}", e)
    })
}

#[tauri::command]
pub async fn delete_bookmark(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_bookmark(&id).map_err(|e| {
        log::error!("Failed to delete bookmark '{}': {}", id, e);
        format!("Failed to delete bookmark: {}", e)
    })
}

#[tauri::command]
pub async fn update_bookmark_access_time(
    state: State<'_, AppState>,
    id: String,
    last_accessed: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_bookmark_access_time(&id, &last_accessed)
        .map_err(|e| {
            log::error!("Failed to update bookmark access time for '{}': {}", id, e);
            format!("Failed to update bookmark: {}", e)
        })
}
