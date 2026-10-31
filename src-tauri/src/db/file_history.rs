use anyhow::Result;
use chrono::Local;
use std::sync::{Arc, Mutex};

use crate::db::schema;

pub struct FileHistoryStore {
    conn: Arc<Mutex<rusqlite::Connection>>,
}

/// Matches the frontend's `getCurrentTimestamp()` (`YYYYMMDD / HHMMSS`) so the
/// stored `last_opened` values share one sortable format. Mixed formats (e.g.
/// RFC3339) break `ORDER BY last_opened DESC`.
fn now_timestamp() -> String {
    Local::now().format("%Y%m%d / %H%M%S").to_string()
}

impl FileHistoryStore {
    pub(crate) fn new(conn: Arc<Mutex<rusqlite::Connection>>) -> Self {
        Self { conn }
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
        conn.execute("DELETE FROM file_history WHERE path = ?1", rusqlite::params![path])?;
        Ok(())
    }

    pub fn clear_file_history(&self) -> Result<()> {
        let conn = lock_conn!(self);
        conn.execute("DELETE FROM file_history", [])?;
        Ok(())
    }

    pub fn delete_orphan_file_history(&self) -> Result<Vec<String>> {
        crate::db::delete_orphans(&self.conn, "file_history", "path")
    }

    pub fn import_file_history(&self, paths: &[String]) -> Result<()> {
        if paths.is_empty() {
            return Ok(());
        }
        let now = now_timestamp();
        let mut conn = lock_conn!(self);
        let tx = conn.transaction()?;
        tx.execute_batch("DROP TRIGGER IF EXISTS prune_file_history")?;
        {
            let mut stmt =
                tx.prepare_cached("INSERT OR IGNORE INTO file_history (path, last_opened) VALUES (?1, ?2)")?;
            for path in paths {
                stmt.execute(rusqlite::params![path, &now])?;
            }
        }
        tx.execute_batch(&schema::prune_file_history_ddl())?;
        tx.execute_batch(&schema::prune_file_history_trigger_ddl())?;
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::utils::test_util::make_temp_dir;
    use std::fs;

    fn open_store(name: &str) -> (Database, std::path::PathBuf) {
        let dir = make_temp_dir(name);
        let db = Database::new(dir.join("history.db")).unwrap();
        (db, dir)
    }

    #[test]
    fn insert_keeps_only_the_newest_entries() {
        let (db, dir) = open_store("file-history-cap");
        let store = db.file_history();
        let limit = schema::FILE_HISTORY_LIMIT as usize;

        for i in 0..limit + 2 {
            store
                .add_file_history_entry(&format!("/f{i:04}.md"), &format!("20260101 / {i:06}"))
                .unwrap();
        }

        let files = store.get_file_history().unwrap();
        assert_eq!(files.len(), limit);
        let newest = format!("/f{:04}.md", limit + 1);
        assert_eq!(files.first().map(String::as_str), Some(newest.as_str()));
        assert!(
            !files.contains(&"/f0000.md".to_string()),
            "oldest entry survived the prune"
        );
        assert!(
            !files.contains(&"/f0001.md".to_string()),
            "second oldest entry survived the prune"
        );

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn import_prunes_to_the_limit_and_restores_the_trigger() {
        let (db, dir) = open_store("file-history-import");
        let store = db.file_history();
        let limit = schema::FILE_HISTORY_LIMIT as usize;

        let paths: Vec<String> = (0..limit + 5).map(|i| format!("/f{i:04}.md")).collect();
        store.import_file_history(&paths).unwrap();
        assert_eq!(store.get_file_history().unwrap().len(), limit);

        // The trigger is dropped for the bulk insert; if it is not reinstalled,
        // the next entry pushes the table past the cap again.
        store.add_file_history_entry("/later.md", "99999999 / 999999").unwrap();
        assert_eq!(store.get_file_history().unwrap().len(), limit);

        fs::remove_dir_all(&dir).unwrap();
    }
}
