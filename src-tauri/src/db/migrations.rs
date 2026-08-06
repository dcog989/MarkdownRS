use anyhow::Result;
use rusqlite::Connection;

use crate::db::schema;

pub(super) fn migrations() -> Vec<String> {
    vec![
        // v1: Initial Schema (fresh databases start here with the full schema)
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
    CREATE TABLE IF NOT EXISTS file_history (
        path TEXT PRIMARY KEY,
        last_opened TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tabs_sort_index ON tabs(sort_index);
    CREATE INDEX IF NOT EXISTS idx_closed_tabs_sort_index ON closed_tabs(sort_index);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created DESC);
    CREATE INDEX IF NOT EXISTS idx_file_history_last_opened ON file_history(last_opened DESC);
    CREATE TRIGGER IF NOT EXISTS prune_file_history
    AFTER INSERT ON file_history
    WHEN (SELECT COUNT(*) FROM file_history) > 999
    BEGIN
        DELETE FROM file_history WHERE path NOT IN (
            SELECT path FROM file_history ORDER BY last_opened DESC LIMIT 999
        );
    END;",
            schema::tab_columns_ddl(),
            schema::tab_columns_ddl(),
        ),
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

    fn table_columns(conn: &Connection, table: &str) -> Vec<String> {
        conn.prepare(&format!("PRAGMA table_info({})", table))
            .unwrap()
            .query_map([], |row| row.get(1))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap()
    }

    #[test]
    fn fresh_database_ends_with_schema_columns() {
        let mut conn = Connection::open_in_memory().unwrap();
        setup_schema(&mut conn).unwrap();

        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);

        let expected: Vec<String> = schema::TAB_COLUMNS
            .iter()
            .map(|c| c.name.to_string())
            .collect();
        for table in ["tabs", "closed_tabs"] {
            assert_eq!(
                table_columns(&conn, table),
                expected,
                "{} column set drifted from schema",
                table
            );
        }
    }

    #[test]
    fn setup_schema_is_idempotent_on_existing_database() {
        let mut conn = Connection::open_in_memory().unwrap();
        setup_schema(&mut conn).unwrap();
        setup_schema(&mut conn).unwrap();

        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);

        let expected: Vec<String> = schema::TAB_COLUMNS
            .iter()
            .map(|c| c.name.to_string())
            .collect();
        for table in ["tabs", "closed_tabs"] {
            assert_eq!(table_columns(&conn, table), expected);
        }
    }
}
