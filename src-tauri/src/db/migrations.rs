use anyhow::Result;
use rusqlite::Connection;

pub(super) const MIGRATIONS: &[&str] = &[
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
    // v4: Add missing indexes for closed_tabs.sort_index and bookmarks.created
    "CREATE INDEX IF NOT EXISTS idx_closed_tabs_sort_index ON closed_tabs(sort_index);
     CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created DESC);",
    // v5: Add original_index to tabs for unified save_tabs logic
    "ALTER TABLE tabs ADD COLUMN original_index INTEGER;",
    // v6: Rename recent_files to file_history (schema now matches user-facing name)
    "ALTER TABLE recent_files RENAME TO file_history;
     DROP INDEX IF EXISTS idx_recent_files_last_opened;
     CREATE INDEX IF NOT EXISTS idx_file_history_last_opened ON file_history(last_opened DESC);
     DROP TRIGGER IF EXISTS prune_recent_files;
     CREATE TRIGGER IF NOT EXISTS prune_file_history
     AFTER INSERT ON file_history
     WHEN (SELECT COUNT(*) FROM file_history) > 999
     BEGIN
         DELETE FROM file_history WHERE path NOT IN (
             SELECT path FROM file_history ORDER BY last_opened DESC LIMIT 999
         );
     END;",
];

pub(super) fn setup_schema(conn: &mut Connection) -> Result<()> {
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
