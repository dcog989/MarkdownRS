use anyhow::Result;
use rusqlite::Connection;

use crate::db::schema;

/// Idempotent base schema for a fresh database. Every statement uses
/// `IF NOT EXISTS`, so re-running against an existing database is a no-op;
/// `setup_schema` then converges the tab tables on `TAB_COLUMNS`.
fn base_schema_ddl() -> String {
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
    )
}

pub(super) fn setup_schema(conn: &mut Connection) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute_batch(&base_schema_ddl())?;
    // Existing databases can predate a column addition; `CREATE TABLE IF NOT
    // EXISTS` won't add it, so converge tabs/closed_tabs on TAB_COLUMNS.
    // This also auto-migrates any future column added to the single source of
    // truth without a hand-written migration.
    ensure_tab_columns(&tx, "tabs")?;
    ensure_tab_columns(&tx, "closed_tabs")?;
    tx.commit()?;
    Ok(())
}

fn ensure_tab_columns(tx: &rusqlite::Transaction, table: &str) -> Result<()> {
    let existing: Vec<String> = tx
        .prepare(&format!("PRAGMA table_info({})", table))?
        .query_map([], |row| row.get(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    for col in schema::TAB_COLUMNS {
        if existing.iter().any(|name| name == col.name) {
            continue;
        }
        if col.ddl.contains("PRIMARY KEY") {
            // A primary key column cannot be retroactively added; every real
            // database already has it from the initial schema.
            continue;
        }
        log::info!("Adding missing column {} to {}", col.name, table);
        tx.execute_batch(&format!(
            "ALTER TABLE {table} ADD COLUMN {} {};",
            col.name, col.ddl
        ))?;
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

        let expected: Vec<String> = schema::TAB_COLUMNS
            .iter()
            .map(|c| c.name.to_string())
            .collect();
        for table in ["tabs", "closed_tabs"] {
            assert_eq!(table_columns(&conn, table), expected);
        }
    }

    #[test]
    fn setup_schema_adds_missing_columns_to_existing_database() {
        // Simulate a database created before `line_ending` existed: the column
        // is missing from the physical tables, and base schema DDL alone won't
        // add it back.
        let mut conn = Connection::open_in_memory().unwrap();
        setup_schema(&mut conn).unwrap();
        conn.execute_batch("ALTER TABLE tabs DROP COLUMN line_ending")
            .unwrap();
        conn.execute_batch("ALTER TABLE closed_tabs DROP COLUMN line_ending")
            .unwrap();

        setup_schema(&mut conn).unwrap();

        // ALTER TABLE ADD COLUMN appends columns at the end, so the physical
        // order after a re-add differs from TAB_COLUMNS; compare as sets.
        let mut expected: Vec<String> = schema::TAB_COLUMNS
            .iter()
            .map(|c| c.name.to_string())
            .collect();
        for table in ["tabs", "closed_tabs"] {
            let mut actual = table_columns(&conn, table);
            actual.sort();
            expected.sort();
            assert_eq!(actual, expected);
        }
    }
}
