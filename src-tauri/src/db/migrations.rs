use anyhow::Result;
use rusqlite::Connection;

use crate::db::schema;

pub(super) fn migrations() -> Vec<String> {
    vec![
        // v1: Initial Schema
        format!(
            "CREATE TABLE IF NOT EXISTS tabs (
        {}
    );
    CREATE TABLE IF NOT EXISTS closed_tabs (
        {}
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
            schema::tab_columns_ddl(1),
            schema::tab_columns_ddl(u32::MAX),
        ),
        // v2: Add index on tabs.sort_index for faster session restore
        "CREATE INDEX IF NOT EXISTS idx_tabs_sort_index ON tabs(sort_index);".to_string(),
        // v3: Increase recent files retention from 99 to 999
        "DROP TRIGGER IF EXISTS prune_recent_files;
     CREATE TRIGGER IF NOT EXISTS prune_recent_files
     AFTER INSERT ON recent_files
     WHEN (SELECT COUNT(*) FROM recent_files) > 999
     BEGIN
         DELETE FROM recent_files WHERE path NOT IN (
             SELECT path FROM recent_files ORDER BY last_opened DESC LIMIT 999
         );
     END;"
            .to_string(),
        // v4: Add missing indexes for closed_tabs.sort_index and bookmarks.created
        "CREATE INDEX IF NOT EXISTS idx_closed_tabs_sort_index ON closed_tabs(sort_index);
     CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created DESC);"
            .to_string(),
        // v5: Add original_index to tabs for unified save_tabs logic
        format!(
            "ALTER TABLE tabs ADD COLUMN original_index {};",
            schema::tab_column_ddl("original_index")
        ),
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
     END;"
            .to_string(),
    ]
}

pub(super) fn setup_schema(conn: &mut Connection) -> Result<()> {
    let current_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    for (i, migration) in migrations().into_iter().enumerate() {
        let version = (i + 1) as i32;
        if version > current_version {
            log::info!("Applying database migration v{}", version);
            let tx = conn.transaction()?;
            tx.execute_batch(&migration)?;
            tx.execute(&format!("PRAGMA user_version = {}", version), [])?;
            tx.commit()?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_database_ends_with_schema_columns() {
        let mut conn = Connection::open_in_memory().unwrap();
        setup_schema(&mut conn).unwrap();

        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 6);

        let expected: Vec<String> = schema::TAB_COLUMNS
            .iter()
            .map(|c| c.name.to_string())
            .collect();
        for table in ["tabs", "closed_tabs"] {
            let cols: Vec<String> = conn
                .prepare(&format!("PRAGMA table_info({})", table))
                .unwrap()
                .query_map([], |row| row.get(1))
                .unwrap()
                .collect::<rusqlite::Result<Vec<_>>>()
                .unwrap();
            assert_eq!(cols, expected, "{} column set drifted from schema", table);
        }
    }
}
