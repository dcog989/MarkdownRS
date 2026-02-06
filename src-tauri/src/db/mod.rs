use anyhow::Result;
use chrono::Local;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct TabState {
    pub id: String,
    pub title: String,
    pub content: Option<String>,
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

impl TabState {
    /// Normalizes newlines in the tab content from `\r\n` to `\n`.
    pub fn normalize_newlines(&mut self) {
        if let Some(content) = &mut self.content
            && content.contains("\r\n")
        {
            *content = content.replace("\r\n", "\n");
        }
    }
}

impl fmt::Debug for TabState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TabState")
            .field("id", &self.id)
            .field("title", &self.title)
            .field(
                "content",
                &self
                    .content
                    .as_ref()
                    .map(|c| format!("<{} bytes>", c.len()))
                    .unwrap_or_else(|| "<no update>".to_string()),
            )
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

#[derive(Serialize)]
pub struct TabData {
    pub content: Option<String>,
}

pub type DbPool = r2d2::Pool<SqliteConnectionManager>;

#[derive(Clone)]
pub struct Database {
    pool: DbPool,
}

const MIGRATIONS: &[&str] = &[
    // v1: Initial Schema
    "CREATE TABLE IF NOT EXISTS tabs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
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
    );
    CREATE TABLE IF NOT EXISTS closed_tabs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
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
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        tags TEXT NOT NULL,
        created TEXT NOT NULL,
        last_accessed TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bookmarks_path ON bookmarks(path);
    CREATE TABLE IF NOT EXISTS recent_files (
        path TEXT PRIMARY KEY,
        last_opened TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recent_files_last_opened ON recent_files(last_opened DESC);",
];

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        log::info!("Initializing database at {:?}", db_path);

        let manager = SqliteConnectionManager::file(&db_path).with_init(|conn| {
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA auto_vacuum = INCREMENTAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;",
            )?;
            Ok(())
        });

        let pool = r2d2::Pool::builder()
            .max_size(5)
            .min_idle(Some(2))
            .connection_timeout(std::time::Duration::from_secs(5))
            .build(manager)?;

        let mut conn = pool.get()?;
        Self::setup_schema(&mut conn)?;
        drop(conn);

        Ok(Self { pool })
    }

    fn setup_schema(conn: &mut Connection) -> Result<()> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
            [],
        )?;

        // Use MAX to ensure we get the latest version if multiple rows exist due to previous INSERT usage
        let current_version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        for (i, migration) in MIGRATIONS.iter().enumerate() {
            let version = (i + 1) as i32;
            if version > current_version {
                log::info!("Applying database migration v{}", version);
                let tx = conn.transaction()?;
                tx.execute_batch(migration)?;

                // Clear old versions to keep table clean and singular
                tx.execute("DELETE FROM schema_version", [])?;
                tx.execute(
                    "INSERT INTO schema_version (version) VALUES (?1)",
                    [version],
                )?;
                tx.commit()?;
            }
        }

        Ok(())
    }

    pub fn save_session(&self, active_tabs: &[TabState], closed_tabs: &[TabState]) -> Result<()> {
        let mut conn = self.pool.get()?;
        let tx = conn.transaction()?;

        // Create temp table once for mark-and-sweep pattern
        tx.execute(
            "CREATE TEMPORARY TABLE IF NOT EXISTS _sync_keep_ids (id TEXT PRIMARY KEY)",
            [],
        )?;

        // Process Active Tabs
        if active_tabs.is_empty() {
            tx.execute("DELETE FROM tabs", [])?;
        } else {
            // Clear and populate keep list
            tx.execute("DELETE FROM _sync_keep_ids", [])?;
            let mut keep_stmt =
                tx.prepare("INSERT OR IGNORE INTO _sync_keep_ids (id) VALUES (?1)")?;
            for tab in active_tabs {
                keep_stmt.execute([&tab.id])?;
            }
            drop(keep_stmt);

            // Delete rows not in keep list (static SQL - no format! allocation)
            tx.execute(
                "DELETE FROM tabs WHERE id NOT IN (SELECT id FROM _sync_keep_ids)",
                [],
            )?;

            let mut insert_stmt = tx.prepare_cached(
                "INSERT INTO tabs (
                    id, title, content, is_dirty, path, scroll_percentage,
                    created, modified, is_pinned, custom_title,
                    file_check_failed, file_check_performed, mru_position, sort_index
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
                ON CONFLICT(id) DO NOTHING",
            )?;

            let mut update_full_stmt = tx.prepare_cached(
                "UPDATE tabs SET
                    title=?2, content=?3, is_dirty=?4, path=?5, scroll_percentage=?6,
                    created=?7, modified=?8, is_pinned=?9, custom_title=?10,
                    file_check_failed=?11, file_check_performed=?12, mru_position=?13, sort_index=?14
                WHERE id=?1",
            )?;

            let mut update_metadata_stmt = tx.prepare_cached(
                "UPDATE tabs SET
                    title=?2, is_dirty=?3, path=?4, scroll_percentage=?5,
                    created=?6, modified=?7, is_pinned=?8, custom_title=?9,
                    file_check_failed=?10, file_check_performed=?11, mru_position=?12, sort_index=?13
                WHERE id=?1",
            )?;

            for tab in active_tabs {
                let mut final_content = tab.content.clone();

                // Content Migration: If payload is null, try to harvest content from the other table before it's deleted
                if final_content.is_none()
                    && let Ok(existing) = tx.query_row(
                        "SELECT content FROM closed_tabs WHERE id = ?1",
                        params![&tab.id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                {
                    final_content = existing;
                }

                let insert_result = insert_stmt.execute(params![
                    &tab.id,
                    &tab.title,
                    &final_content,
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

                if insert_result == 0 {
                    if tab.content.is_some() {
                        update_full_stmt.execute(params![
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
                    } else {
                        update_metadata_stmt.execute(params![
                            &tab.id,
                            &tab.title,
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
            }
        }

        // Process Closed Tabs
        if closed_tabs.is_empty() {
            tx.execute("DELETE FROM closed_tabs", [])?;
        } else {
            // Clear and populate keep list
            tx.execute("DELETE FROM _sync_keep_ids", [])?;
            let mut keep_stmt =
                tx.prepare("INSERT OR IGNORE INTO _sync_keep_ids (id) VALUES (?1)")?;
            for tab in closed_tabs {
                keep_stmt.execute([&tab.id])?;
            }
            drop(keep_stmt);

            // Delete rows not in keep list (static SQL - no format! allocation)
            tx.execute(
                "DELETE FROM closed_tabs WHERE id NOT IN (SELECT id FROM _sync_keep_ids)",
                [],
            )?;

            let mut insert_stmt = tx.prepare_cached(
                "INSERT INTO closed_tabs (
                    id, title, content, is_dirty, path, scroll_percentage,
                    created, modified, is_pinned, custom_title,
                    file_check_failed, file_check_performed, mru_position, sort_index, original_index
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
                ON CONFLICT(id) DO NOTHING",
            )?;

            let mut update_full_stmt = tx.prepare_cached(
                "UPDATE closed_tabs SET
                    title=?2, content=?3, is_dirty=?4, path=?5, scroll_percentage=?6,
                    created=?7, modified=?8, is_pinned=?9, custom_title=?10,
                    file_check_failed=?11, file_check_performed=?12, mru_position=?13, sort_index=?14, original_index=?15
                WHERE id=?1",
            )?;

            let mut update_metadata_stmt = tx.prepare_cached(
                "UPDATE closed_tabs SET
                    title=?2, is_dirty=?3, path=?4, scroll_percentage=?5,
                    created=?6, modified=?7, is_pinned=?8, custom_title=?9,
                    file_check_failed=?10, file_check_performed=?11, mru_position=?12, sort_index=?13, original_index=?14
                WHERE id=?1",
            )?;

            for (i, tab) in closed_tabs.iter().enumerate() {
                let mut final_content = tab.content.clone();

                // Content Migration: If payload is null, harvest from active table before re-inserting
                if final_content.is_none()
                    && let Ok(existing) = tx.query_row(
                        "SELECT content FROM tabs WHERE id = ?1",
                        params![&tab.id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                {
                    final_content = existing;
                }

                let insert_result = insert_stmt.execute(params![
                    &tab.id,
                    &tab.title,
                    &final_content,
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
                    i as i32,
                    &tab.original_index
                ])?;

                if insert_result == 0 {
                    if tab.content.is_some() {
                        update_full_stmt.execute(params![
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
                            i as i32,
                            &tab.original_index
                        ])?;
                    } else {
                        update_metadata_stmt.execute(params![
                            &tab.id,
                            &tab.title,
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
                            i as i32,
                            &tab.original_index
                        ])?;
                    }
                }
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn load_session(&self) -> Result<SessionData> {
        self.load_session_with_content(true)
    }

    pub fn load_session_with_content(&self, include_content: bool) -> Result<SessionData> {
        let conn = self.pool.get()?;

        let query = if include_content {
            "SELECT id, title, content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed, mru_position, sort_index
             FROM tabs ORDER BY sort_index ASC"
        } else {
            "SELECT id, title, NULL as content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed, mru_position, sort_index
             FROM tabs ORDER BY sort_index ASC"
        };

        let mut active_stmt = conn.prepare(query)?;

        let active_tabs = active_stmt
            .query_map([], |row| {
                Ok(TabState {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: if include_content {
                        Some(row.get::<_, Option<String>>(2)?.unwrap_or_default())
                    } else {
                        None
                    },
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

        let closed_query = if include_content {
            "SELECT id, title, content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed, mru_position, sort_index, original_index
             FROM closed_tabs ORDER BY sort_index ASC"
        } else {
            "SELECT id, title, NULL as content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed, mru_position, sort_index, original_index
             FROM closed_tabs ORDER BY sort_index ASC"
        };

        let mut closed_stmt = conn.prepare(closed_query)?;

        let closed_tabs = closed_stmt
            .query_map([], |row| {
                Ok(TabState {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: if include_content {
                        Some(row.get::<_, Option<String>>(2)?.unwrap_or_default())
                    } else {
                        None
                    },
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

        Ok(SessionData {
            active_tabs,
            closed_tabs,
        })
    }

    pub fn load_tab_data(&self, tab_id: &str) -> Result<TabData> {
        let conn = self.pool.get()?;
        let content = conn
            .query_row(
                "SELECT content FROM tabs WHERE id = ?1
             UNION ALL
             SELECT content FROM closed_tabs WHERE id = ?1",
                params![tab_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => anyhow::anyhow!("Tab not found"),
                _ => anyhow::anyhow!(e),
            })?;

        Ok(TabData { content })
    }

    pub fn add_bookmark(&self, bookmark: &Bookmark) -> Result<()> {
        let conn = self.pool.get()?;
        let tags_json = serde_json::to_string(&bookmark.tags)?;
        conn.execute(
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
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
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
        Ok(bookmarks)
    }

    pub fn delete_bookmark(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_bookmark_access_time(&self, id: &str, last_accessed: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "UPDATE bookmarks SET last_accessed = ?1 WHERE id = ?2",
            params![last_accessed, id],
        )?;
        Ok(())
    }

    pub fn seed_recent_files_from_history(&self) -> Result<()> {
        let conn = self.pool.get()?;
        let now = Local::now().format("%Y%m%d / %H%M%S").to_string();

        // 1. Backfill from active tabs
        conn.execute(
            "INSERT OR IGNORE INTO recent_files (path, last_opened)
             SELECT path, COALESCE(modified, created, ?1)
             FROM tabs
             WHERE path IS NOT NULL AND path != ''",
            params![&now],
        )?;

        // 2. Backfill from closed tabs history
        // GROUP BY path ensures we only take the most recent entry if there are duplicates in closed_tabs
        conn.execute(
            "INSERT OR IGNORE INTO recent_files (path, last_opened)
             SELECT path, MAX(COALESCE(modified, created, ?1))
             FROM closed_tabs
             WHERE path IS NOT NULL AND path != ''
             GROUP BY path",
            params![&now],
        )?;

        // 3. Prune logic to ensure we don't exceed limit immediately
        conn.execute(
            "DELETE FROM recent_files WHERE path NOT IN (
                SELECT path FROM recent_files ORDER BY last_opened DESC LIMIT 99
            )",
            [],
        )?;

        Ok(())
    }

    pub fn add_recent_file(&self, path: &str, last_opened: &str) -> Result<()> {
        let conn = self.pool.get()?;

        // Insert or Update the recent file
        conn.execute(
            "INSERT OR REPLACE INTO recent_files (path, last_opened) VALUES (?1, ?2)",
            params![path, last_opened],
        )?;

        // Prune logic: Keep only recent 99 entries
        conn.execute(
            "DELETE FROM recent_files WHERE path NOT IN (
                SELECT path FROM recent_files ORDER BY last_opened DESC LIMIT 99
            )",
            [],
        )?;

        Ok(())
    }

    pub fn get_recent_files(&self) -> Result<Vec<String>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare("SELECT path FROM recent_files ORDER BY last_opened DESC")?;
        let files = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(files)
    }

    pub fn remove_recent_file(&self, path: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM recent_files WHERE path = ?1", params![path])?;
        Ok(())
    }

    pub fn clear_recent_files(&self) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM recent_files", [])?;
        Ok(())
    }

    pub fn incremental_vacuum(&self, max_pages: i32) -> Result<()> {
        let conn = self.pool.get()?;
        if max_pages > 0 {
            conn.execute(&format!("PRAGMA incremental_vacuum({})", max_pages), [])?;
        } else {
            conn.execute("PRAGMA incremental_vacuum", [])?;
        }
        Ok(())
    }

    pub fn get_freelist_count(&self) -> Result<i32> {
        let conn = self.pool.get()?;
        let count: i32 = conn.query_row("PRAGMA freelist_count", [], |row| row.get(0))?;
        Ok(count)
    }
}
