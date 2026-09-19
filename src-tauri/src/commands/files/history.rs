use crate::utils::{handle_error, run_blocking};

#[tauri::command]
pub async fn add_to_file_history(
    state: tauri::State<'_, crate::state::AppState>,
    path: String,
    last_opened: String,
) -> Result<(), String> {
    let db = state.db.clone();
    run_blocking("add to file history", move || {
        db.file_history()
            .add_file_history_entry(&path, &last_opened)
            .map_err(|e| handle_error(Some(&path), "add to file history", e))
    })
    .await
}

#[tauri::command]
pub async fn get_file_history(state: tauri::State<'_, crate::state::AppState>) -> Result<Vec<String>, String> {
    let db = state.db.clone();
    run_blocking("get file history", move || {
        db.file_history()
            .get_file_history()
            .map_err(|e| handle_error(None, "get file history", e))
    })
    .await
}

#[tauri::command]
pub async fn remove_from_file_history(
    state: tauri::State<'_, crate::state::AppState>,
    path: String,
) -> Result<(), String> {
    let db = state.db.clone();
    run_blocking("remove from file history", move || {
        db.file_history()
            .remove_file_history_entry(&path)
            .map_err(|e| handle_error(Some(&path), "remove from file history", e))
    })
    .await
}

#[tauri::command]
pub async fn clear_file_history(state: tauri::State<'_, crate::state::AppState>) -> Result<(), String> {
    let db = state.db.clone();
    run_blocking("clear file history", move || {
        db.file_history()
            .clear_file_history()
            .map_err(|e| handle_error(None, "clear file history", e))
    })
    .await
}
