use anyhow::Result;
use log;
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
    #[serde(default)]
    pub mru_position: Option<i32>,
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
        // WAL: Better concurrency for auto-saves
        // INCREMENTAL: Reclaims disk space more efficiently than FULL without blocking I/O
        // FULL auto_vacuum causes excessive page movement on every DELETE, impacting performance
        // With INCREMENTAL, we can control when vacuuming happens via manual PRAGMA incremental_vacuum calls
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA auto_vacuum = INCREMENTAL;
             PRAGMA foreign_keys = ON;",
        )?;

        let version = Self::get_schema_version(&conn)?;

        // Use transaction for all schema changes to enable rollback on error
        let tx = conn.transaction()?;

        match version {
            0 => {
                // Initial schema creation
                log::info!("Creating initial database schema");
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
                        mru_position INTEGER
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

                tx.execute("INSERT INTO schema_version (version) VALUES (?1)", [5])?;
                log::info!("Initial schema created successfully (version 5)");
            }
            v if v < 5 => {
                // Progressive migrations
                let mut current_version = v;

                if current_version < 2 {
                    // Migration from v1 to v2: Add is_pinned and custom_title columns
                    log::info!(
                        "Migrating database schema from version {} to 2",
                        current_version
                    );
                    tx.execute(
                        "ALTER TABLE tabs ADD COLUMN is_pinned INTEGER DEFAULT 0",
                        [],
                    )?;
                    tx.execute("ALTER TABLE tabs ADD COLUMN custom_title TEXT", [])?;
                    current_version = 2;
                    log::info!("Migration to version 2 completed successfully");
                }

                if current_version < 3 {
                    // Migration from v2 to v3: Add file_check_failed and file_check_performed columns
                    log::info!(
                        "Migrating database schema from version {} to 3",
                        current_version
                    );
                    tx.execute(
                        "ALTER TABLE tabs ADD COLUMN file_check_failed INTEGER DEFAULT 0",
                        [],
                    )?;
                    tx.execute(
                        "ALTER TABLE tabs ADD COLUMN file_check_performed INTEGER DEFAULT 0",
                        [],
                    )?;
                    current_version = 3;
                    log::info!("Migration to version 3 completed successfully");
                }

                if current_version < 4 {
                    // Migration from v3 to v4: Add mru_position column
                    log::info!(
                        "Migrating database schema from version {} to 4",
                        current_version
                    );
                    tx.execute("ALTER TABLE tabs ADD COLUMN mru_position INTEGER", [])?;
                    current_version = 4;
                    log::info!("Migration to version 4 completed successfully");
                }

                if current_version < 5 {
                    // Migration from v4 to v5: Add bookmarks table
                    log::info!(
                        "Migrating database schema from version {} to 5",
                        current_version
                    );
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
                    current_version = 5;
                    log::info!("Migration to version 5 completed successfully");
                }

                tx.execute("UPDATE schema_version SET version = ?", [current_version])?;
            }
            5 => {
                // Current version, no migration needed
                log::info!("Database schema is up to date (version {})", version);
            }
            _ => {
                // Future migrations would go here
                log::warn!("Unknown schema version {}, attempting to continue", version);
            }
        }

        // Commit transaction - if any error occurred above, this won't execute
        // and the transaction will rollback automatically when dropped
        tx.commit().map_err(|e| {
            log::error!(
                "Failed to commit database initialization transaction: {}",
                e
            );
            e
        })?;
        log::info!("Database initialization completed successfully");

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
        log::info!("Saving {} tabs to database", tabs.len());

        let tx = self.conn.transaction().map_err(|e| {
            log::error!("Failed to begin transaction for save_session: {}", e);
            e
        })?;

        // 1. Delete tabs that are no longer in the session
        if tabs.is_empty() {
            tx.execute("DELETE FROM tabs", [])?;
        } else {
            // Use a temporary table for IDs to safely handle the deletion of removed tabs
            // without worrying about SQL variable limits
            tx.execute(
                "CREATE TEMP TABLE IF NOT EXISTS active_tab_ids (id TEXT PRIMARY KEY)",
                [],
            )?;
            tx.execute("DELETE FROM active_tab_ids", [])?;

            {
                let mut stmt = tx.prepare_cached("INSERT INTO active_tab_ids (id) VALUES (?)")?;
                for tab in tabs {
                    stmt.execute([&tab.id])?;
                }
            }

            tx.execute(
                "DELETE FROM tabs WHERE id NOT IN (SELECT id FROM active_tab_ids)",
                [],
            )?;
            tx.execute("DELETE FROM active_tab_ids", [])?;
        }

        // 2. Upsert current tabs
        // The WHERE clause in ON CONFLICT ensures we only write to disk if something actually changed
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO tabs (
                    id, title, content, is_dirty, path, scroll_percentage,
                    created, modified, is_pinned, custom_title,
                    file_check_failed, file_check_performed, mru_position
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
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
                    mru_position=excluded.mru_position
                WHERE
                    title != excluded.title OR
                    content != excluded.content OR
                    is_dirty != excluded.is_dirty OR
                    path IS NOT excluded.path OR
                    scroll_percentage != excluded.scroll_percentage OR
                    is_pinned != excluded.is_pinned OR
                    custom_title IS NOT excluded.custom_title OR
                    file_check_failed != excluded.file_check_failed OR
                    file_check_performed != excluded.file_check_performed OR
                    mru_position != excluded.mru_position",
            )?;

            for tab in tabs {
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
                    &tab.mru_position
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

    pub fn load_session(&self) -> Result<Vec<TabState>> {
        log::info!("Loading session from database");

        let mut stmt = self.conn.prepare(
            "SELECT id, title, content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed, mru_position FROM tabs ORDER BY ROWID"
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
                    mru_position: row.get(12).ok(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        log::info!("Loaded {} tabs from database", tabs.len());
        Ok(tabs)
    }

    #[allow(dead_code)]
    pub fn clear_session(&self) -> Result<()> {
        log::info!("Clearing session data");
        self.conn.execute("DELETE FROM tabs", [])?;
        Ok(())
    }

    // Bookmark operations
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

    /// Performs incremental vacuum to reclaim freed pages
    /// Should be called periodically (e.g., on app shutdown or after many session saves)
    /// The parameter specifies maximum pages to reclaim (0 = reclaim all free pages)
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

    /// Returns the number of freelist pages that could be reclaimed
    pub fn get_freelist_count(&self) -> Result<i32> {
        let count: i32 = self
            .conn
            .query_row("PRAGMA freelist_count", [], |row| row.get(0))?;
        Ok(count)
    }
}
