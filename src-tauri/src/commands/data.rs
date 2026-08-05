use crate::db::Bookmark;
use crate::state::AppState;
use crate::utils::handle_error;
use tauri::State;

#[tauri::command]
pub fn export_bookmarks(state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> {
    state
        .db
        .bookmarks()
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
        .bookmarks()
        .import_bookmarks(&bookmarks)
        .map_err(|e| handle_error(Some("bookmarks"), "import bookmarks", e))?;
    Ok(count)
}

#[tauri::command]
pub fn export_file_history(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state
        .db
        .file_history()
        .get_file_history()
        .map_err(|e| handle_error(Some("file history"), "export file history", e))
}

#[tauri::command]
pub fn import_file_history(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<usize, String> {
    let count = paths.len();
    state
        .db
        .file_history()
        .import_file_history(&paths)
        .map_err(|e| handle_error(Some("file history"), "import file history", e))?;
    Ok(count)
}

#[tauri::command]
pub fn delete_orphan_files(state: State<'_, AppState>) -> Result<usize, String> {
    let history = state
        .db
        .file_history()
        .delete_orphan_file_history()
        .map_err(|e| handle_error(Some("file history"), "delete orphan file history", e))?;
    let bookmarks = state
        .db
        .bookmarks()
        .delete_orphan_bookmarks()
        .map_err(|e| handle_error(Some("bookmarks"), "delete orphan bookmarks", e))?;
    Ok(history + bookmarks)
}
