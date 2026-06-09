use anyhow::Result;
use chrono::Local;

use crate::db::Database;

impl Database {
    pub fn seed_recent_files_from_history(&self) -> Result<()> {
        let conn = lock_conn!(self);
        let now = Local::now().to_rfc3339();

        conn.execute(
            "INSERT OR IGNORE INTO recent_files (path, last_opened)
             SELECT path, COALESCE(modified, created, ?1)
             FROM tabs
             WHERE path IS NOT NULL AND path != ''",
            rusqlite::params![&now],
        )?;

        conn.execute(
            "INSERT OR IGNORE INTO recent_files (path, last_opened)
             SELECT path, MAX(COALESCE(modified, created, ?1))
             FROM closed_tabs
             WHERE path IS NOT NULL AND path != ''
             GROUP BY path",
            rusqlite::params![&now],
        )?;

        Ok(())
    }

    pub fn add_recent_file(&self, path: &str, last_opened: &str) -> Result<()> {
        let conn = lock_conn!(self);

        conn.execute(
            "INSERT OR REPLACE INTO recent_files (path, last_opened) VALUES (?1, ?2)",
            rusqlite::params![path, last_opened],
        )?;

        Ok(())
    }

    pub fn get_recent_files(&self) -> Result<Vec<String>> {
        let conn = lock_conn!(self);
        let mut stmt = conn.prepare("SELECT path FROM recent_files ORDER BY last_opened DESC")?;
        let files = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(files)
    }

    pub fn remove_recent_file(&self, path: &str) -> Result<()> {
        let conn = lock_conn!(self);
        conn.execute(
            "DELETE FROM recent_files WHERE path = ?1",
            rusqlite::params![path],
        )?;
        Ok(())
    }

    pub fn clear_recent_files(&self) -> Result<()> {
        let conn = lock_conn!(self);
        conn.execute("DELETE FROM recent_files", [])?;
        Ok(())
    }

    pub fn delete_orphan_recent_files(&self) -> Result<usize> {
        let conn = lock_conn!(self);
        crate::db::delete_orphans(&conn, "recent_files", "path")
    }

    pub fn import_recent_files(&self, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }
        let now = Local::now().to_rfc3339();
        let mut conn = lock_conn!(self);
        let tx = conn.transaction()?;
        tx.execute_batch("DROP TRIGGER IF EXISTS prune_recent_files")?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR IGNORE INTO recent_files (path, last_opened) VALUES (?1, ?2)",
            )?;
            for path in paths {
                stmt.execute(rusqlite::params![path, &now])?;
            }
        }
        tx.execute_batch(
            "DELETE FROM recent_files WHERE path NOT IN (
                SELECT path FROM recent_files ORDER BY last_opened DESC LIMIT 999
            );",
        )?;
        tx.execute_batch(
            "CREATE TRIGGER IF NOT EXISTS prune_recent_files
            AFTER INSERT ON recent_files
            WHEN (SELECT COUNT(*) FROM recent_files) > 999
            BEGIN
                DELETE FROM recent_files WHERE path NOT IN (
                    SELECT path FROM recent_files ORDER BY last_opened DESC LIMIT 999
                );
            END;",
        )?;
        tx.commit()?;
        Ok(())
    }
}
