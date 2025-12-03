use anyhow::Result;
use log::info;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TabState {
    pub id: String,
    pub title: String,
    pub content: String,
    pub is_dirty: bool,
    pub path: Option<String>,
    pub scroll_percentage: f64,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        info!("Initializing database at {:?}", db_path);
        let conn = Connection::open(db_path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tabs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                is_dirty INTEGER NOT NULL,
                path TEXT,
                scroll_percentage REAL NOT NULL
            )",
            [],
        )?;

        Ok(Self { conn })
    }

    pub fn save_session(&self, tabs: &[TabState]) -> Result<()> {
        info!("Saving {} tabs to database", tabs.len());

        self.conn.execute("DELETE FROM tabs", [])?;

        for tab in tabs {
            self.conn.execute(
                "INSERT INTO tabs (id, title, content, is_dirty, path, scroll_percentage)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &tab.id,
                    &tab.title,
                    &tab.content,
                    if tab.is_dirty { 1 } else { 0 },
                    &tab.path,
                    tab.scroll_percentage
                ],
            )?;
        }

        info!("Session saved successfully");
        Ok(())
    }

    pub fn load_session(&self) -> Result<Vec<TabState>> {
        info!("Loading session from database");

        let mut stmt = self
            .conn
            .prepare("SELECT id, title, content, is_dirty, path, scroll_percentage FROM tabs")?;

        let tabs = stmt
            .query_map([], |row| {
                Ok(TabState {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    is_dirty: row.get::<_, i32>(3)? != 0,
                    path: row.get(4)?,
                    scroll_percentage: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        info!("Loaded {} tabs from database", tabs.len());
        Ok(tabs)
    }
}
