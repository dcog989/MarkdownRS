use crate::state::{AppState, MAX_FILE_SIZE_UNSET, SpellcheckStatus};
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex, RwLock};
use tauri::Manager;

pub fn manage(app: &mut tauri::App, db: crate::db::Database) {
    app.manage(AppState {
        db,
        speller: Arc::new(Mutex::new(None)),
        custom_dict: RwLock::new(Arc::new(std::collections::HashSet::new())),
        spellcheck_status: Mutex::new(SpellcheckStatus::Uninitialized),
        loaded_spellcheck_config: Mutex::new(None),
        max_file_size_bytes: AtomicU64::new(MAX_FILE_SIZE_UNSET),
        project_root: Mutex::new(None),
    });
}
