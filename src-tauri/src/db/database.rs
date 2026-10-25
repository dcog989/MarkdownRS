use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use super::migrations;
use super::{BookmarkStore, FileHistoryStore, SessionStore};

/// Cap on the space the WAL keeps on disk. The default (no limit) reuses the
/// file at whatever size it last grew to, so one big save leaves the -wal that
/// large for the rest of the session.
const WAL_SIZE_LIMIT_BYTES: i64 = 16 * 1024 * 1024;

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        log::info!("Initializing database at {:?}", db_path);

        let mut conn = Connection::open(&db_path)?;
        conn.execute_batch(&format!(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;
             PRAGMA journal_size_limit = {WAL_SIZE_LIMIT_BYTES};"
        ))?;

        // auto_vacuum only changes the on-disk layout when the database is
        // vacuumed; a database created before the pragma was enabled silently
        // keeps auto_vacuum=NONE and incremental_vacuum would reclaim nothing.
        // Convert pre-existing databases once (fresh ones are created in
        // INCREMENTAL mode before any tables, so they need no VACUUM).
        let auto_vacuum: i32 = conn.query_row("PRAGMA auto_vacuum", [], |row| row.get(0))?;
        conn.execute_batch("PRAGMA auto_vacuum = INCREMENTAL;")?;
        if auto_vacuum == 0 {
            let has_tables: bool = conn.query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM sqlite_master
                    WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%'
                 )",
                [],
                |row| row.get(0),
            )?;
            if has_tables {
                log::info!("Converting existing database to auto_vacuum=INCREMENTAL");
                conn.execute_batch("VACUUM;")?;
            }
        }

        migrations::setup_schema(&mut conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn session(&self) -> SessionStore {
        SessionStore::new(Arc::clone(&self.conn))
    }

    pub fn bookmarks(&self) -> BookmarkStore {
        BookmarkStore::new(Arc::clone(&self.conn))
    }

    pub fn file_history(&self) -> FileHistoryStore {
        FileHistoryStore::new(Arc::clone(&self.conn))
    }

    /// Reclaims every page on the freelist. `auto_vacuum=INCREMENTAL` only moves
    /// freed pages to the freelist; without this the file never shrinks below
    /// its historical high-water mark.
    pub fn incremental_vacuum(&self) -> Result<()> {
        let conn = lock_conn!(self);
        let free_pages: i32 = conn.query_row("PRAGMA freelist_count", [], |row| row.get(0))?;
        if free_pages == 0 {
            return Ok(());
        }
        log::info!("Reclaiming {} free pages from the session database", free_pages);
        // The pragma yields one row per reclaimed page; `execute`/`execute_batch`
        // step only once, so they would free a single page and stop.
        let mut stmt = conn.prepare("PRAGMA incremental_vacuum")?;
        let mut rows = stmt.query([])?;
        while rows.next()?.is_some() {}
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Bookmark;
    use crate::utils::test_util::make_temp_dir;

    fn freelist_count(db: &Database) -> i32 {
        let conn = lock_conn!(db);
        conn.query_row("PRAGMA freelist_count", [], |row| row.get(0)).unwrap()
    }

    #[test]
    fn incremental_vacuum_reclaims_pages_freed_by_deletes() {
        let dir = make_temp_dir("vacuum");
        let db = Database::new(dir.join("vacuum.db")).unwrap();
        let bookmark = Bookmark {
            id: "b1".to_string(),
            path: "/b.md".to_string(),
            title: "x".repeat(1 << 20),
            tags: Vec::new(),
            created: "2026-01-01".to_string(),
            last_accessed: None,
        };

        db.bookmarks().add_bookmark(&bookmark).unwrap();
        db.bookmarks().delete_bookmark("b1").unwrap();
        assert!(freelist_count(&db) > 0, "deleting a large row should leave free pages");

        db.incremental_vacuum().unwrap();

        assert_eq!(freelist_count(&db), 0);
    }
}
