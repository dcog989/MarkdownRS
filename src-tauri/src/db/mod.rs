use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Debug)]
pub struct TabState {
    pub id: String,
    pub path: Option<String>,
    pub title: String,
    pub content: String,
    pub is_dirty: bool,
    pub scroll_percentage: f64,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tabs (
                id TEXT PRIMARY KEY,
                path TEXT,
                title TEXT,
                content TEXT,
                is_dirty BOOLEAN,
                scroll_percentage REAL,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        Ok(Database { conn })
    }

    pub fn save_session(&self, tabs: &[TabState]) -> Result<()> {
        // Simple strategy: Clear and rewrite for v1.
        // In v2, we would upsert to preserve history/metadata.
        self.conn.execute("DELETE FROM tabs", [])?;

        let mut stmt = self.conn.prepare(
            "INSERT INTO tabs (id, path, title, content, is_dirty, scroll_percentage)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;

        for tab in tabs {
            stmt.execute(params![
                tab.id,
                tab.path,
                tab.title,
                tab.content,
                tab.is_dirty,
                tab.scroll_percentage
            ])?;
        }
        Ok(())
    }

    pub fn load_session(&self) -> Result<Vec<TabState>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, title, content, is_dirty, scroll_percentage
             FROM tabs
             ORDER BY last_active DESC",
        )?;

        let tab_iter = stmt.query_map([], |row| {
            Ok(TabState {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                is_dirty: row.get(4)?,
                scroll_percentage: row.get(5)?,
            })
        })?;

        let mut tabs = Vec::new();
        for tab in tab_iter {
            tabs.push(tab?);
        }
        Ok(tabs)
    }
}
