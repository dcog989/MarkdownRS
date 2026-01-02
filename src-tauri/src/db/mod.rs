use anyhow::Result;
use log;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
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
    #[serde(default)]
    pub mru_position: Option<i32>,
    #[serde(default)]
    pub sort_index: Option<i32>,
    #[serde(default)]
    pub original_index: Option<i32>,
}

impl fmt::Debug for TabState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TabState")
            .field("id", &self.id)
            .field("title", &self.title)
            .field("content", &format!("<{} bytes>", self.content.len()))
            .field("is_dirty", &self.is_dirty)
            .field("path", &self.path)
            .finish()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionData {
    pub active_tabs: Vec<TabState>,
    pub closed_tabs: Vec<TabState>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Bookmark {
    pub id: String,
    pub path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub created: String,
    pub last_accessed: Option<String>,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        log::info!("Initializing database at {:?}", db_path);
        let mut conn = Connection::open(db_path)?;

        // Performance & Maintenance Optimization
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA auto_vacuum = INCREMENTAL;
             PRAGMA foreign_keys = ON;",
        )?;

        let version = Self::get_schema_version(&conn)?;
        let tx = conn.transaction()?;

        match version {
            0 => {
                log::info!("Creating initial database schema (v1)");

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
                        file_check_performed INTEGER DEFAULT 0,
                        mru_position INTEGER,
                        sort_index INTEGER DEFAULT 0
                    )",
                    [],
                )?;

                tx.execute(
                    "CREATE TABLE IF NOT EXISTS closed_tabs (
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
                        file_check_performed INTEGER DEFAULT 0,
                        mru_position INTEGER,
                        sort_index INTEGER DEFAULT 0,
                        original_index INTEGER
                    )",
                    [],
                )?;

                tx.execute(
                    "CREATE TABLE IF NOT EXISTS bookmarks (
                        id TEXT PRIMARY KEY,
                        path TEXT NOT NULL UNIQUE,
                        title TEXT NOT NULL,
                        tags TEXT NOT NULL,
                        created TEXT NOT NULL,
                        last_accessed TEXT
                    )",
                    [],
                )?;

                tx.execute(
                    "CREATE INDEX IF NOT EXISTS idx_bookmarks_path ON bookmarks(path)",
                    [],
                )?;

                tx.execute(
                    "CREATE TABLE IF NOT EXISTS schema_version (
                        version INTEGER PRIMARY KEY
                    )",
                    [],
                )?;

                tx.execute("INSERT INTO schema_version (version) VALUES (?1)", [1])?;
                log::info!("Database schema initialized at version 1");
            }
            1 => {
                log::info!("Database schema is up to date (version 1)");
            }
            v => {
                log::warn!(
                    "Unknown database schema version {}, attempting to continue",
                    v
                );
            }
        }

        tx.commit().map_err(|e| {
            log::error!(
                "Failed to commit database initialization transaction: {}",
                e
            );
            e
        })?;

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
                let tabs_exists: bool = conn.query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tabs'",
                    [],
                    |row| {
                        let count: i32 = row.get(0)?;
                        Ok(count > 0)
                    },
                )?;

                if tabs_exists { Ok(0) } else { Ok(0) }
            }
        }
    }

    pub fn save_session(
        &mut self,
        active_tabs: &[TabState],
        closed_tabs: &[TabState],
    ) -> Result<()> {
        log::info!(
            "Saving session: {} active tabs, {} closed tabs",
            active_tabs.len(),
            closed_tabs.len()
        );

        let tx = self.conn.transaction().map_err(|e| {
            log::error!("Failed to begin transaction for save_session: {}", e);
            e
        })?;

        // --- Save Active Tabs ---
        if active_tabs.is_empty() {
            tx.execute("DELETE FROM tabs", [])?;
        } else {
            tx.execute(
                "CREATE TEMP TABLE IF NOT EXISTS active_tab_ids (id TEXT PRIMARY KEY)",
                [],
            )?;
            tx.execute("DELETE FROM active_tab_ids", [])?;

            {
                let mut stmt = tx.prepare_cached("INSERT INTO active_tab_ids (id) VALUES (?)")?;
                for tab in active_tabs {
                    stmt.execute([&tab.id])?;
                }
            }

            tx.execute(
                "DELETE FROM tabs WHERE id NOT IN (SELECT id FROM active_tab_ids)",
                [],
            )?;
            tx.execute("DELETE FROM active_tab_ids", [])?;
        }

        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO tabs (
                    id, title, content, is_dirty, path, scroll_percentage,
                    created, modified, is_pinned, custom_title,
                    file_check_failed, file_check_performed, mru_position, sort_index
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    content=excluded.content,
                    is_dirty=excluded.is_dirty,
                    path=excluded.path,
                    scroll_percentage=excluded.scroll_percentage,
                    created=excluded.created,
                    modified=excluded.modified,
                    is_pinned=excluded.is_pinned,
                    custom_title=excluded.custom_title,
                    file_check_failed=excluded.file_check_failed,
                    file_check_performed=excluded.file_check_performed,
                    mru_position=excluded.mru_position,
                    sort_index=excluded.sort_index",
            )?;

            for tab in active_tabs {
                stmt.execute(params![
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
                    if tab.file_check_performed { 1 } else { 0 },
                    &tab.mru_position,
                    &tab.sort_index
                ])?;
            }
        }

        // --- Save Closed Tabs ---
        // For closed tabs, we treat it as a replace all since history order matters
        tx.execute("DELETE FROM closed_tabs", [])?;

        if !closed_tabs.is_empty() {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO closed_tabs (
                    id, title, content, is_dirty, path, scroll_percentage,
                    created, modified, is_pinned, custom_title,
                    file_check_failed, file_check_performed, mru_position, sort_index, original_index
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            )?;

            // Save in order (0 is most recent in the array)
            // We use sort_index to maintain the history order
            for (i, tab) in closed_tabs.iter().enumerate() {
                stmt.execute(params![
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
                    if tab.file_check_performed { 1 } else { 0 },
                    &tab.mru_position,
                    i as i32, // Use sort_index for history order
                    &tab.original_index
                ])?;
            }
        }

        tx.commit().map_err(|e| {
            log::error!("Failed to commit save_session transaction: {}", e);
            e
        })?;
        log::info!("Session saved successfully");
        Ok(())
    }

    pub fn load_session(&self) -> Result<SessionData> {
        log::info!("Loading session from database");

        // Load Active Tabs
        let mut active_stmt = self.conn.prepare(
            "SELECT id, title, content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed, mru_position, sort_index
             FROM tabs ORDER BY sort_index ASC"
        )?;

        let active_tabs = active_stmt
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
                    mru_position: row.get(12).ok(),
                    sort_index: row.get(13).ok(),
                    original_index: None,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // Load Closed Tabs
        let mut closed_stmt = self.conn.prepare(
            "SELECT id, title, content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed, mru_position, sort_index, original_index
             FROM closed_tabs ORDER BY sort_index ASC"
        )?;

        let closed_tabs = closed_stmt
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
                    mru_position: row.get(12).ok(),
                    sort_index: row.get(13).ok(),
                    original_index: row.get(14).ok(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        log::info!(
            "Loaded {} active tabs and {} closed tabs",
            active_tabs.len(),
            closed_tabs.len()
        );

        Ok(SessionData {
            active_tabs,
            closed_tabs,
        })
    }

    pub fn add_bookmark(&self, bookmark: &Bookmark) -> Result<()> {
        log::info!("Adding bookmark: {} ({})", bookmark.title, bookmark.path);
        let tags_json = serde_json::to_string(&bookmark.tags)?;
        self.conn.execute(
            "INSERT OR REPLACE INTO bookmarks (id, path, title, tags, created, last_accessed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                &bookmark.id,
                &bookmark.path,
                &bookmark.title,
                &tags_json,
                &bookmark.created,
                &bookmark.last_accessed
            ],
        )?;
        Ok(())
    }

    pub fn get_all_bookmarks(&self) -> Result<Vec<Bookmark>> {
        log::info!("Loading all bookmarks from database");
        let mut stmt = self.conn.prepare(
            "SELECT id, path, title, tags, created, last_accessed FROM bookmarks ORDER BY created DESC"
        )?;

        let bookmarks = stmt
            .query_map([], |row| {
                let tags_json: String = row.get(3)?;
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
                Ok(Bookmark {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    tags,
                    created: row.get(4)?,
                    last_accessed: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        log::info!("Loaded {} bookmarks from database", bookmarks.len());
        Ok(bookmarks)
    }

    pub fn delete_bookmark(&self, id: &str) -> Result<()> {
        log::info!("Deleting bookmark: {}", id);
        self.conn
            .execute("DELETE FROM bookmarks WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_bookmark_access_time(&self, id: &str, last_accessed: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE bookmarks SET last_accessed = ?1 WHERE id = ?2",
            params![last_accessed, id],
        )?;
        Ok(())
    }

    pub fn incremental_vacuum(&self, max_pages: i32) -> Result<()> {
        log::info!("Running incremental vacuum (max {} pages)", max_pages);
        if max_pages > 0 {
            self.conn
                .execute(&format!("PRAGMA incremental_vacuum({})", max_pages), [])?;
        } else {
            self.conn.execute("PRAGMA incremental_vacuum", [])?;
        }
        Ok(())
    }

    pub fn get_freelist_count(&self) -> Result<i32> {
        let count: i32 = self
            .conn
            .query_row("PRAGMA freelist_count", [], |row| row.get(0))?;
        Ok(count)
    }
}
