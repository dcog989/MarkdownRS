use crate::db::Bookmark;
use crate::state::AppState;
use crate::utils::{handle_error, run_blocking};
use tauri::State;

#[tauri::command]
pub async fn add_bookmark(state: State<'_, AppState>, bookmark: Bookmark) -> Result<(), String> {
    let db = state.db.clone();
    run_blocking("add bookmark", move || {
        db.bookmarks()
            .add_bookmark(&bookmark)
            .map_err(|e| handle_error(Some(&bookmark.path), "add bookmark", e))
    })
    .await
}

#[tauri::command]
pub async fn get_all_bookmarks(state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> {
    let db = state.db.clone();
    run_blocking("retrieve bookmarks", move || {
        db.bookmarks()
            .get_all_bookmarks()
            .map_err(|e| handle_error(Some("all"), "retrieve bookmarks", e))
    })
    .await
}

#[tauri::command]
pub async fn delete_bookmark(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.clone();
    run_blocking("delete bookmark", move || {
        db.bookmarks()
            .delete_bookmark(&id)
            .map_err(|e| handle_error(Some(&id), "delete bookmark", e))
    })
    .await
}

#[tauri::command]
pub async fn update_bookmark_access_time(
    state: State<'_, AppState>,
    id: String,
    last_accessed: String,
) -> Result<(), String> {
    let db = state.db.clone();
    run_blocking("update bookmark", move || {
        db.bookmarks()
            .update_bookmark_access_time(&id, &last_accessed)
            .map_err(|e| handle_error(Some(&id), "update bookmark", e))
    })
    .await
}
