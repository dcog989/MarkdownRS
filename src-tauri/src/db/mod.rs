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
    CREATE TABLE IF NOT EXISTS recent_files (
        path TEXT PRIMARY KEY,
        last_opened TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recent_files_last_opened ON recent_files(last_opened DESC);
    CREATE TRIGGER IF NOT EXISTS prune_recent_files
    AFTER INSERT ON recent_files
    WHEN (SELECT COUNT(*) FROM recent_files) > 99
    BEGIN
        DELETE FROM recent_files WHERE path NOT IN (
            SELECT path FROM recent_files ORDER BY last_opened DESC LIMIT 99
        );
    END;",
    // v2: Add index on tabs.sort_index for faster session restore
    "CREATE INDEX IF NOT EXISTS idx_tabs_sort_index ON tabs(sort_index);",
    // v3: Increase recent files retention from 99 to 999
    "DROP TRIGGER IF EXISTS prune_recent_files;
    CREATE TRIGGER IF NOT EXISTS prune_recent_files
    AFTER INSERT ON recent_files
    WHEN (SELECT COUNT(*) FROM recent_files) > 999
    BEGIN
        DELETE FROM recent_files WHERE path NOT IN (
            SELECT path FROM recent_files ORDER BY last_opened DESC LIMIT 999
        );
    END;",
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
            .max_size(3)
            .min_idle(Some(1))
            .connection_timeout(std::time::Duration::from_secs(5))
            .build(manager)?;

        let mut conn = pool.get()?;
        Self::setup_schema(&mut conn)?;
        drop(conn);

        Ok(Self { pool })
    }

    fn setup_schema(conn: &mut Connection) -> Result<()> {
        // Use PRAGMA user_version for atomic schema versioning
        let current_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

        for (i, migration) in MIGRATIONS.iter().enumerate() {
            let version = (i + 1) as i32;
            if version > current_version {
                log::info!("Applying database migration v{}", version);
                let tx = conn.transaction()?;
                tx.execute_batch(migration)?;
                tx.execute(&format!("PRAGMA user_version = {}", version), [])?;
                tx.commit()?;
            }
        }

        Ok(())
    }

    pub fn save_session(&self, active_tabs: &[TabState], closed_tabs: &[TabState]) -> Result<()> {
        let mut conn = self.pool.get()?;
        let tx = conn.transaction()?;

        self.save_active_tabs(&tx, active_tabs)?;
        self.save_closed_tabs(&tx, closed_tabs)?;

        tx.commit()?;
        Ok(())
    }

    fn save_active_tabs(&self, tx: &rusqlite::Transaction, tabs: &[TabState]) -> Result<()> {
        if tabs.is_empty() {
            tx.execute("DELETE FROM tabs", [])?;
            return Ok(());
        }

        // Remove tabs that are no longer open in a single DELETE
        let placeholders = (1..=tabs.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let delete_sql = format!("DELETE FROM tabs WHERE id NOT IN ({})", placeholders);
        let mut delete_stmt = tx.prepare(&delete_sql)?;
        let ids: Vec<&dyn rusqlite::types::ToSql> = tabs
            .iter()
            .map(|t| &t.id as &dyn rusqlite::types::ToSql)
            .collect();
        delete_stmt.execute(ids.as_slice())?;

        // Upsert each tab; preserve existing DB content when the frontend sends no content update
        let mut upsert_stmt = tx.prepare_cached(
            "INSERT INTO tabs (
                id, title, content, is_dirty, path, scroll_percentage,
                created, modified, is_pinned, custom_title,
                file_check_failed, file_check_performed, mru_position, sort_index
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
                title              = excluded.title,
                content            = CASE WHEN excluded.content IS NOT NULL
                                          THEN excluded.content
                                          ELSE tabs.content END,
                is_dirty           = excluded.is_dirty,
                path               = excluded.path,
                scroll_percentage  = excluded.scroll_percentage,
                created            = excluded.created,
                modified           = excluded.modified,
                is_pinned          = excluded.is_pinned,
                custom_title       = excluded.custom_title,
                file_check_failed  = excluded.file_check_failed,
                file_check_performed = excluded.file_check_performed,
                mru_position       = excluded.mru_position,
                sort_index         = excluded.sort_index",
        )?;

        for tab in tabs {
            // Treat empty string the same as no-update (preserve DB content)
            let content = tab.content.as_deref().filter(|c| !c.is_empty());
            upsert_stmt.execute(params![
                &tab.id,
                &tab.title,
                content,
                tab.is_dirty as i32,
                &tab.path,
                tab.scroll_percentage,
                &tab.created,
                &tab.modified,
                tab.is_pinned as i32,
                &tab.custom_title,
                tab.file_check_failed as i32,
                tab.file_check_performed as i32,
                &tab.mru_position,
                &tab.sort_index,
            ])?;
        }

        Ok(())
    }
    fn save_closed_tabs(&self, tx: &rusqlite::Transaction, tabs: &[TabState]) -> Result<()> {
        if tabs.is_empty() {
            tx.execute("DELETE FROM closed_tabs", [])?;
            return Ok(());
        }

        let placeholders = (1..=tabs.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let delete_sql = format!("DELETE FROM closed_tabs WHERE id NOT IN ({})", placeholders);
        let mut delete_stmt = tx.prepare(&delete_sql)?;
        let ids: Vec<&dyn rusqlite::types::ToSql> = tabs
            .iter()
            .map(|t| &t.id as &dyn rusqlite::types::ToSql)
            .collect();
        delete_stmt.execute(ids.as_slice())?;

        let mut upsert_stmt = tx.prepare_cached(
            "INSERT INTO closed_tabs (
                id, title, content, is_dirty, path, scroll_percentage,
                created, modified, is_pinned, custom_title,
                file_check_failed, file_check_performed, mru_position, sort_index, original_index
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ON CONFLICT(id) DO UPDATE SET
                title              = excluded.title,
                content            = CASE WHEN excluded.content IS NOT NULL
                                          THEN excluded.content
                                          ELSE closed_tabs.content END,
                is_dirty           = excluded.is_dirty,
                path               = excluded.path,
                scroll_percentage  = excluded.scroll_percentage,
                created            = excluded.created,
                modified           = excluded.modified,
                is_pinned          = excluded.is_pinned,
                custom_title       = excluded.custom_title,
                file_check_failed  = excluded.file_check_failed,
                file_check_performed = excluded.file_check_performed,
                mru_position       = excluded.mru_position,
                sort_index         = excluded.sort_index,
                original_index     = excluded.original_index",
        )?;

        for (i, tab) in tabs.iter().enumerate() {
            let content = tab.content.as_deref().filter(|c| !c.is_empty());
            upsert_stmt.execute(params![
                &tab.id,
                &tab.title,
                content,
                tab.is_dirty as i32,
                &tab.path,
                tab.scroll_percentage,
                &tab.created,
                &tab.modified,
                tab.is_pinned as i32,
                &tab.custom_title,
                tab.file_check_failed as i32,
                tab.file_check_performed as i32,
                &tab.mru_position,
                i as i32,
                &tab.original_index,
            ])?;
        }

        Ok(())
    }
    pub fn load_session(&self) -> Result<SessionData> {
        self.load_session_with_content(false)
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
                    is_pinned: row.get::<_, i32>(8)? != 0,
                    custom_title: row.get(9)?,
                    file_check_failed: row.get::<_, i32>(10)? != 0,
                    file_check_performed: row.get::<_, i32>(11)? != 0,
                    mru_position: row.get(12)?,
                    sort_index: row.get(13)?,
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
                    is_pinned: row.get::<_, i32>(8)? != 0,
                    custom_title: row.get(9)?,
                    file_check_failed: row.get::<_, i32>(10)? != 0,
                    file_check_performed: row.get::<_, i32>(11)? != 0,
                    mru_position: row.get(12)?,
                    sort_index: row.get(13)?,
                    original_index: row.get(14)?,
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
                 SELECT content FROM closed_tabs WHERE id = ?1
                 LIMIT 1",
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
            "INSERT INTO bookmarks (id, path, title, tags, created, last_accessed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                path          = excluded.path,
                title         = excluded.title,
                tags          = excluded.tags,
                created       = excluded.created,
                last_accessed = excluded.last_accessed",
            params![
                &bookmark.id,
                &bookmark.path,
                &bookmark.title,
                &tags_json,
                &bookmark.created,
                &bookmark.last_accessed,
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
        let now = Local::now().to_rfc3339();

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
        // The prune_recent_files trigger automatically handles cleanup after each insert
        conn.execute(
            "INSERT OR IGNORE INTO recent_files (path, last_opened)
             SELECT path, MAX(COALESCE(modified, created, ?1))
             FROM closed_tabs
             WHERE path IS NOT NULL AND path != ''
             GROUP BY path",
            params![&now],
        )?;

        Ok(())
    }

    pub fn add_recent_file(&self, path: &str, last_opened: &str) -> Result<()> {
        let conn = self.pool.get()?;

        // Insert or Update the recent file
        // The prune_recent_files trigger automatically handles cleanup
        conn.execute(
            "INSERT OR REPLACE INTO recent_files (path, last_opened) VALUES (?1, ?2)",
            params![path, last_opened],
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

    pub fn delete_orphan_recent_files(&self) -> Result<usize> {
        let conn = self.pool.get()?;
        let paths: Vec<String> = {
            let mut stmt = conn.prepare("SELECT path FROM recent_files")?;
            stmt.query_map([], |row| row.get(0))?
                .collect::<rusqlite::Result<Vec<String>>>()?
        };

        let dead: Vec<&str> = paths
            .iter()
            .filter(|p| !std::path::Path::new(p.as_str()).exists())
            .map(String::as_str)
            .collect();

        if dead.is_empty() {
            return Ok(0);
        }

        let placeholders = (1..=dead.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("DELETE FROM recent_files WHERE path IN ({})", placeholders);
        let params: Vec<&dyn rusqlite::types::ToSql> = dead
            .iter()
            .map(|p| p as &dyn rusqlite::types::ToSql)
            .collect();
        conn.execute(&sql, params.as_slice())?;

        Ok(dead.len())
    }

    pub fn delete_orphan_bookmarks(&self) -> Result<usize> {
        let conn = self.pool.get()?;
        let entries: Vec<(String, String)> = {
            let mut stmt = conn.prepare("SELECT id, path FROM bookmarks")?;
            stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<rusqlite::Result<Vec<(String, String)>>>()?
        };

        let dead_ids: Vec<&str> = entries
            .iter()
            .filter(|(_, path)| !std::path::Path::new(path.as_str()).exists())
            .map(|(id, _)| id.as_str())
            .collect();

        if dead_ids.is_empty() {
            return Ok(0);
        }

        let placeholders = (1..=dead_ids.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("DELETE FROM bookmarks WHERE id IN ({})", placeholders);
        let params: Vec<&dyn rusqlite::types::ToSql> = dead_ids
            .iter()
            .map(|id| id as &dyn rusqlite::types::ToSql)
            .collect();
        conn.execute(&sql, params.as_slice())?;

        Ok(dead_ids.len())
    }

    pub fn import_bookmarks(&self, bookmarks: &[Bookmark]) -> Result<()> {
        if bookmarks.is_empty() {
            return Ok(());
        }
        let mut conn = self.pool.get()?;
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO bookmarks (id, path, title, tags, created, last_accessed)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                    path          = excluded.path,
                    title         = excluded.title,
                    tags          = excluded.tags,
                    created       = excluded.created,
                    last_accessed = excluded.last_accessed",
            )?;
            for bookmark in bookmarks {
                let tags_json = serde_json::to_string(&bookmark.tags)?;
                stmt.execute(params![
                    &bookmark.id,
                    &bookmark.path,
                    &bookmark.title,
                    tags_json,
                    &bookmark.created,
                    &bookmark.last_accessed,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn import_recent_files(&self, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }
        let now = Local::now().to_rfc3339();
        let mut conn = self.pool.get()?;
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO recent_files (path, last_opened) VALUES (?1, ?2)",
            )?;
            for path in paths {
                stmt.execute(params![path, &now])?;
            }
        }
        tx.commit()?;
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
