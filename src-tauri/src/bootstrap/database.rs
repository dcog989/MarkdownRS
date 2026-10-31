use crate::db::Database;
use crate::state::AppState;
use rusqlite::ErrorCode;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use tauri::{Listener, Manager};

pub fn init(db_path: PathBuf, db_dir: &Path) -> Result<Database, String> {
    match Database::new(db_path.clone()) {
        Ok(db) => Ok(db),
        Err(e) if is_corruption(&e) => {
            log::error!("Session database is corrupt: {}", e);
            recover_corrupt_database(db_path, db_dir)
        },
        Err(e) => {
            log::error!("Failed to initialize database: {}", e);
            Err(format!("Failed to open the session database: {}", e))
        },
    }
}

/// Only SQLite's own corruption codes justify replacing the file. A lock,
/// permission or disk-full failure must be reported, not "recovered" by
/// renaming a healthy database away.
fn is_corruption(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<rusqlite::Error>()
            .and_then(rusqlite::Error::sqlite_error_code)
            .is_some_and(|code| matches!(code, ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase))
    })
}

fn recover_corrupt_database(db_path: PathBuf, db_dir: &Path) -> Result<Database, String> {
    if db_path.exists() {
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup_path = db_dir.join(format!("session.db.bak.{}", timestamp));

        if let Err(io_err) = fs::rename(&db_path, &backup_path) {
            log::error!("Failed to rename corrupted database: {}", io_err);
            return Err(format!("Database corruption detected. Failed to backup: {}", io_err));
        }
        log::info!("Corrupted database moved to {:?}", backup_path);
    }

    // Sidecar files belong to the failed DB whether or not the main
    // file still exists (it may have vanished since the failed open);
    // leaving them behind can break opening the fresh database.
    remove_sidecar_files(&db_path, &["-wal", "-shm"]);

    Database::new(db_path).map_err(|retry_err| {
        log::error!("Failed to initialize fresh database: {}", retry_err);
        format!(
            "Critical: Failed to create new database after corruption: {}",
            retry_err
        )
    })
}

/// Reclaims pages freed by deleted or rewritten tabs once the frontend reports
/// a finished restore, so the vacuum never holds the shared connection ahead of
/// the first tab-content read.
/// shortcut: once per launch, so a long session keeps its freed pages until the
/// next start.
pub fn schedule_vacuum(app_handle: &tauri::AppHandle) {
    let handle = app_handle.clone();
    app_handle.once("frontend-ready", move |_| {
        let db = handle.state::<AppState>().db.clone();
        tokio::task::spawn_blocking(move || {
            if let Err(e) = db.incremental_vacuum() {
                log::warn!("Failed to reclaim freed database pages: {}", e);
            }
        });
    });
}

/// Remove SQLite WAL/SHM sidecar files for a database path.
/// They belong to the pre-recovery database and must not survive the
/// main file being renamed away, or opening the fresh DB at the same
/// path can hit `SQLITE_NOTADB` / mismatch errors.
fn remove_sidecar_files(db_path: &Path, suffixes: &[&str]) {
    for suffix in suffixes {
        let path = PathBuf::from(format!("{}{}", db_path.display(), suffix));
        if path.exists() {
            match fs::remove_file(&path) {
                Ok(()) => log::info!("Removed orphaned sidecar file {:?}", path),
                Err(e) => log::warn!("Failed to remove sidecar file {:?}: {}", path, e),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_util::make_temp_dir;

    fn backup_count(dir: &Path) -> usize {
        fs::read_dir(dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().starts_with("session.db.bak."))
            .count()
    }

    #[test]
    fn open_failure_that_is_not_corruption_leaves_the_path_untouched() {
        let dir = make_temp_dir("db-open-failure");
        let db_path = dir.join("session.db");
        // SQLite reports a directory as SQLITE_CANTOPEN, not a corruption code.
        fs::create_dir(&db_path).unwrap();
        fs::write(db_path.join("keep"), "data").unwrap();

        assert!(init(db_path.clone(), &dir).is_err());

        assert!(db_path.is_dir(), "the existing path was moved away");
        assert!(db_path.join("keep").exists());
        assert_eq!(backup_count(&dir), 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn corrupt_database_is_backed_up_and_replaced() {
        let dir = make_temp_dir("db-corrupt");
        let db_path = dir.join("session.db");
        fs::write(&db_path, b"this file is not a sqlite database, only text").unwrap();

        let db = init(db_path.clone(), &dir).unwrap();

        assert_eq!(backup_count(&dir), 1, "corrupt database was not backed up");
        assert!(db_path.exists(), "no fresh database was created");
        assert!(db.bookmarks().get_all_bookmarks().is_ok(), "fresh database is unusable");
        fs::remove_dir_all(&dir).unwrap();
    }
}
