use crate::db::Bookmark;
use crate::state::AppState;
use crate::utils::{handle_error, run_blocking};
use tauri::State;

#[tauri::command]
pub async fn import_bookmarks(state: State<'_, AppState>, bookmarks: Vec<Bookmark>) -> Result<usize, String> {
    let db = state.db.clone();
    run_blocking("import bookmarks", move || {
        // Report what was written, not what the file contained.
        db.bookmarks()
            .import_bookmarks(&bookmarks)
            .map_err(|e| handle_error(Some("bookmarks"), "import bookmarks", e))
    })
    .await
}

#[tauri::command]
pub async fn import_file_history(state: State<'_, AppState>, paths: Vec<String>) -> Result<usize, String> {
    let db = state.db.clone();
    run_blocking("import file history", move || {
        db.file_history()
            .import_file_history(&paths)
            .map_err(|e| handle_error(Some("file history"), "import file history", e))
    })
    .await
}

#[tauri::command]
pub async fn delete_orphan_files(
    state: State<'_, AppState>,
    dry_run: bool,
    paths: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let db = state.db.clone();
    run_blocking("delete orphan files", move || {
        // The previewed paths, so a drive that drops after the confirm cannot
        // widen the deletion beyond what the user agreed to.
        let only = paths.as_deref();
        let mut deleted = db
            .file_history()
            .delete_orphan_file_history(dry_run, only)
            .map_err(|e| handle_error(Some("file history"), "delete orphan file history", e))?;
        deleted.extend(
            db.bookmarks()
                .delete_orphan_bookmarks(dry_run, only)
                .map_err(|e| handle_error(Some("bookmarks"), "delete orphan bookmarks", e))?,
        );
        deleted.sort();
        deleted.dedup();
        Ok(deleted)
    })
    .await
}
