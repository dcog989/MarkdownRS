use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use super::migrations;
use super::{BookmarkStore, FileHistoryStore, SessionStore};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        log::info!("Initializing database at {:?}", db_path);

        let mut conn = Connection::open(&db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;",
        )?;

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

    pub fn incremental_vacuum(&self, max_pages: i32) -> Result<()> {
        if max_pages <= 0 {
            return Ok(());
        }
        let conn = lock_conn!(self);
        conn.execute(&format!("PRAGMA incremental_vacuum({})", max_pages), [])?;
        Ok(())
    }

    pub fn get_freelist_count(&self) -> Result<i32> {
        let conn = lock_conn!(self);
        let count: i32 = conn.query_row("PRAGMA freelist_count", [], |row| row.get(0))?;
        Ok(count)
    }
}
