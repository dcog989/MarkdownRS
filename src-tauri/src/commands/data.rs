use crate::db::Bookmark;
use crate::state::AppState;
use crate::utils::{handle_error, run_blocking};
use tauri::State;

#[tauri::command]
pub async fn export_bookmarks(state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> {
    let db = state.db.clone();
    run_blocking("export bookmarks", move || {
        db.bookmarks()
            .get_all_bookmarks()
            .map_err(|e| handle_error(Some("bookmarks"), "export bookmarks", e))
    })
    .await
}

#[tauri::command]
pub async fn import_bookmarks(
    state: State<'_, AppState>,
    bookmarks: Vec<Bookmark>,
) -> Result<usize, String> {
    let count = bookmarks.len();
    let db = state.db.clone();
    run_blocking("import bookmarks", move || {
        db.bookmarks()
            .import_bookmarks(&bookmarks)
            .map_err(|e| handle_error(Some("bookmarks"), "import bookmarks", e))?;
        Ok(count)
    })
    .await
}

#[tauri::command]
pub async fn export_file_history(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let db = state.db.clone();
    run_blocking("export file history", move || {
        db.file_history()
            .get_file_history()
            .map_err(|e| handle_error(Some("file history"), "export file history", e))
    })
    .await
}

#[tauri::command]
pub async fn import_file_history(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<usize, String> {
    let count = paths.len();
    let db = state.db.clone();
    run_blocking("import file history", move || {
        db.file_history()
            .import_file_history(&paths)
            .map_err(|e| handle_error(Some("file history"), "import file history", e))?;
        Ok(count)
    })
    .await
}

#[tauri::command]
pub async fn delete_orphan_files(state: State<'_, AppState>) -> Result<usize, String> {
    let db = state.db.clone();
    run_blocking("delete orphan files", move || {
        let history = db
            .file_history()
            .delete_orphan_file_history()
            .map_err(|e| handle_error(Some("file history"), "delete orphan file history", e))?;
        let bookmarks = db
            .bookmarks()
            .delete_orphan_bookmarks()
            .map_err(|e| handle_error(Some("bookmarks"), "delete orphan bookmarks", e))?;
        Ok(history + bookmarks)
    })
    .await
}
