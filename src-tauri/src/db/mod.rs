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
    pub created: Option<String>,
    pub modified: Option<String>,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub custom_title: Option<String>,
    #[serde(default)]
    pub file_check_failed: bool,
    #[serde(default)]
    pub file_check_performed: bool,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        info!("Initializing database at {:?}", db_path);
        let mut conn = Connection::open(db_path)?;
        let version = Self::get_schema_version(&conn)?;

        // Use transaction for all schema changes to enable rollback on error
        let tx = conn.transaction()?;
        
        match version {
            0 => {
                // Initial schema creation
                info!("Creating initial database schema");
                tx.execute(
                    "CREATE TABLE IF NOT EXISTS tabs (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        content TEXT NOT NULL,
                        is_dirty INTEGER NOT NULL,
                        path TEXT,
                        scroll_percentage REAL NOT NULL,
                        created TEXT,
                        modified TEXT,
                        is_pinned INTEGER DEFAULT 0,
                        custom_title TEXT,
                        file_check_failed INTEGER DEFAULT 0,
                        file_check_performed INTEGER DEFAULT 0
                    )",
                    [],
                )?;

                tx.execute(
                    "CREATE TABLE IF NOT EXISTS schema_version (
                        version INTEGER PRIMARY KEY
                    )",
                    [],
                )?;

                tx.execute("INSERT INTO schema_version (version) VALUES (?1)", [3])?;
                info!("Initial schema created successfully (version 3)");
            }
            v if v < 3 => {
                // Progressive migrations
                let mut current_version = v;
                
                if current_version < 2 {
                    // Migration from v1 to v2: Add is_pinned and custom_title columns
                    info!("Migrating database schema from version {} to 2", current_version);
                    tx.execute("ALTER TABLE tabs ADD COLUMN is_pinned INTEGER DEFAULT 0", [])?;
                    tx.execute("ALTER TABLE tabs ADD COLUMN custom_title TEXT", [])?;
                    current_version = 2;
                    info!("Migration to version 2 completed successfully");
                }
                
                if current_version < 3 {
                    // Migration from v2 to v3: Add file_check_failed and file_check_performed columns
                    info!("Migrating database schema from version {} to 3", current_version);
                    tx.execute("ALTER TABLE tabs ADD COLUMN file_check_failed INTEGER DEFAULT 0", [])?;
                    tx.execute("ALTER TABLE tabs ADD COLUMN file_check_performed INTEGER DEFAULT 0", [])?;
                    current_version = 3;
                    info!("Migration to version 3 completed successfully");
                }
                
                tx.execute("UPDATE schema_version SET version = ?", [current_version])?;
            }
            3 => {
                // Current version, no migration needed
                info!("Database schema is up to date (version {})", version);
            }
            _ => {
                // Future migrations would go here
                info!("Unknown schema version {}, attempting to continue", version);
            }
        }

        // Commit transaction - if any error occurred above, this won't execute
        // and the transaction will rollback automatically when dropped
        tx.commit()?;
        info!("Database initialization completed successfully");

        Ok(Self { conn })
    }

    fn get_schema_version(conn: &Connection) -> Result<i32> {
        let version = conn.query_row(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
            [],
            |row| row.get(0),
        );

        match version {
            Ok(v) => Ok(v),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(0),
            Err(_) => {
                // Table doesn't exist, check if tabs table exists
                let tabs_exists: bool = conn.query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tabs'",
                    [],
                    |row| {
                        let count: i32 = row.get(0)?;
                        Ok(count > 0)
                    },
                )?;

                if tabs_exists {
                    Ok(0) // Old schema without version table
                } else {
                    Ok(0) // Fresh database
                }
            }
        }
    }

    pub fn save_session(&mut self, tabs: &[TabState]) -> Result<()> {
        info!("Saving {} tabs to database", tabs.len());

        let tx = self.conn.transaction()?;

        tx.execute("DELETE FROM tabs", [])?;

        for tab in tabs {
            tx.execute(
                "INSERT INTO tabs (id, title, content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    &tab.id,
                    &tab.title,
                    &tab.content,
                    if tab.is_dirty { 1 } else { 0 },
                    &tab.path,
                    tab.scroll_percentage,
                    &tab.created,
                    &tab.modified,
                    if tab.is_pinned { 1 } else { 0 },
                    &tab.custom_title,
                    if tab.file_check_failed { 1 } else { 0 },
                    if tab.file_check_performed { 1 } else { 0 }
                ],
            )?;
        }

        tx.commit()?;
        info!("Session saved successfully");
        Ok(())
    }

    pub fn load_session(&self) -> Result<Vec<TabState>> {
        info!("Loading session from database");

        let mut stmt = self.conn.prepare(
            "SELECT id, title, content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed FROM tabs"
        )?;

        let tabs = stmt
            .query_map([], |row| {
                Ok(TabState {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    is_dirty: row.get::<_, i32>(3)? != 0,
                    path: row.get(4)?,
                    scroll_percentage: row.get(5)?,
                    created: row.get(6)?,
                    modified: row.get(7)?,
                    is_pinned: row.get::<_, i32>(8).unwrap_or(0) != 0,
                    custom_title: row.get(9).ok(),
                    file_check_failed: row.get::<_, i32>(10).unwrap_or(0) != 0,
                    file_check_performed: row.get::<_, i32>(11).unwrap_or(0) != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        info!("Loaded {} tabs from database", tabs.len());
        Ok(tabs)
    }

    #[allow(dead_code)]
    pub fn clear_session(&self) -> Result<()> {
        info!("Clearing session data");
        self.conn.execute("DELETE FROM tabs", [])?;
        Ok(())
    }
}
