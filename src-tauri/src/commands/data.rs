use crate::db::Bookmark;
use crate::state::AppState;
use crate::utils::handle_error;
use tauri::State;

#[tauri::command]
pub fn export_bookmarks(state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> {
    state
        .db
        .get_all_bookmarks()
        .map_err(|e| handle_error(Some("bookmarks"), "export bookmarks", e))
}

#[tauri::command]
pub fn import_bookmarks(
    state: State<'_, AppState>,
    bookmarks: Vec<Bookmark>,
) -> Result<usize, String> {
    let count = bookmarks.len();
    state
        .db
        .import_bookmarks(&bookmarks)
        .map_err(|e| handle_error(Some("bookmarks"), "import bookmarks", e))?;
    Ok(count)
}

#[tauri::command]
pub fn export_recent_files(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state
        .db
        .get_recent_files()
        .map_err(|e| handle_error(Some("recent files"), "export recent files", e))
}

#[tauri::command]
pub fn import_recent_files(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<usize, String> {
    let count = paths.len();
    state
        .db
        .import_recent_files(&paths)
        .map_err(|e| handle_error(Some("recent files"), "import recent files", e))?;
    Ok(count)
}

#[tauri::command]
pub fn delete_orphan_files(state: State<'_, AppState>) -> Result<usize, String> {
    let recent = state
        .db
        .delete_orphan_recent_files()
        .map_err(|e| handle_error(Some("recent files"), "delete orphan recent files", e))?;
    let bookmarks = state
        .db
        .delete_orphan_bookmarks()
        .map_err(|e| handle_error(Some("bookmarks"), "delete orphan bookmarks", e))?;
    Ok(recent + bookmarks)
}
