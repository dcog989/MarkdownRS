use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use super::migrations;

#[derive(Clone)]
pub struct Database {
    pub(super) conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        log::info!("Initializing database at {:?}", db_path);

        let mut conn = Connection::open(&db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA auto_vacuum = INCREMENTAL;
             PRAGMA busy_timeout = 5000;",
        )?;

        migrations::setup_schema(&mut conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
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
