use anyhow::Result;
use chrono::Local;

use crate::db::Database;

impl Database {
    pub fn seed_file_history_from_session(&self) -> Result<()> {
        let conn = lock_conn!(self);
        let now = Local::now().to_rfc3339();

        conn.execute(
            "INSERT OR IGNORE INTO file_history (path, last_opened)
             SELECT path, COALESCE(modified, created, ?1)
             FROM tabs
             WHERE path IS NOT NULL AND path != ''",
            rusqlite::params![&now],
        )?;

        conn.execute(
            "INSERT OR IGNORE INTO file_history (path, last_opened)
             SELECT path, MAX(COALESCE(modified, created, ?1))
             FROM closed_tabs
             WHERE path IS NOT NULL AND path != ''
             GROUP BY path",
            rusqlite::params![&now],
        )?;

        Ok(())
    }

    pub fn add_file_history_entry(&self, path: &str, last_opened: &str) -> Result<()> {
        let conn = lock_conn!(self);

        conn.execute(
            "INSERT OR REPLACE INTO file_history (path, last_opened) VALUES (?1, ?2)",
            rusqlite::params![path, last_opened],
        )?;

        Ok(())
    }

    pub fn get_file_history(&self) -> Result<Vec<String>> {
        let conn = lock_conn!(self);
        let mut stmt = conn.prepare("SELECT path FROM file_history ORDER BY last_opened DESC")?;
        let files = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(files)
    }

    pub fn remove_file_history_entry(&self, path: &str) -> Result<()> {
        let conn = lock_conn!(self);
        conn.execute(
            "DELETE FROM file_history WHERE path = ?1",
            rusqlite::params![path],
        )?;
        Ok(())
    }

    pub fn clear_file_history(&self) -> Result<()> {
        let conn = lock_conn!(self);
        conn.execute("DELETE FROM file_history", [])?;
        Ok(())
    }

    pub fn delete_orphan_file_history(&self) -> Result<usize> {
        let conn = lock_conn!(self);
        crate::db::delete_orphans(&conn, "file_history", "path")
    }

    pub fn import_file_history(&self, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }
        let now = Local::now().to_rfc3339();
        let mut conn = lock_conn!(self);
        let tx = conn.transaction()?;
        tx.execute_batch("DROP TRIGGER IF EXISTS prune_file_history")?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO file_history (path, last_opened) VALUES (?1, ?2)",
            )?;
            for path in paths {
                stmt.execute(rusqlite::params![path, &now])?;
            }
        }
        tx.execute_batch(
            "DELETE FROM file_history WHERE path NOT IN (
                SELECT path FROM file_history ORDER BY last_opened DESC LIMIT 999
            );",
        )?;
        tx.execute_batch(
            "CREATE TRIGGER IF NOT EXISTS prune_file_history
            AFTER INSERT ON file_history
            WHEN (SELECT COUNT(*) FROM file_history) > 999
            BEGIN
                DELETE FROM file_history WHERE path NOT IN (
                    SELECT path FROM file_history ORDER BY last_opened DESC LIMIT 999
                );
            END;",
        )?;
        tx.commit()?;
        Ok(())
    }
}
