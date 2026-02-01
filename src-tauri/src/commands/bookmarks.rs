use crate::db::Bookmark;
use crate::state::AppState;
use crate::utils::handle_db_error;
use tauri::State;

#[tauri::command]
pub async fn add_bookmark(state: State<'_, AppState>, bookmark: Bookmark) -> Result<(), String> {
    state
        .db
        .add_bookmark(&bookmark)
        .map_err(|e| handle_db_error("add bookmark", &bookmark.path, e))
}

#[tauri::command]
pub async fn get_all_bookmarks(state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> {
    state
        .db
        .get_all_bookmarks()
        .map_err(|e| handle_db_error("retrieve bookmarks", "all", e))
}

#[tauri::command]
pub async fn delete_bookmark(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .db
        .delete_bookmark(&id)
        .map_err(|e| handle_db_error("delete bookmark", &id, e))
}

#[tauri::command]
pub async fn update_bookmark_access_time(
    state: State<'_, AppState>,
    id: String,
    last_accessed: String,
) -> Result<(), String> {
    state
        .db
        .update_bookmark_access_time(&id, &last_accessed)
        .map_err(|e| handle_db_error("update bookmark", &id, e))
}
