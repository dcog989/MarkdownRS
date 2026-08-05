use crate::db::Database;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

pub fn init(db_path: PathBuf, db_dir: &Path) -> Result<Database, String> {
    match Database::new(db_path.clone()) {
        Ok(db) => Ok(db),
        Err(e) => {
            log::error!("Failed to initialize database: {}", e);
            log::warn!("Attempting database recovery...");

            if db_path.exists() {
                let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
                let backup_path = db_dir.join(format!("session.db.bak.{}", timestamp));

                if let Err(io_err) = fs::rename(&db_path, &backup_path) {
                    log::error!("Failed to rename corrupted database: {}", io_err);
                    return Err(format!(
                        "Database corruption detected. Failed to backup: {}",
                        io_err
                    ));
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
        },
    }
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
