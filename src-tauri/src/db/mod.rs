use crate::utils::MutexExt;
use std::path::Path;
use std::sync::Mutex;

macro_rules! lock_conn {
    ($self:expr) => {
        crate::utils::MutexExt::lock_or_recover(&*$self.conn)
    };
}

mod bookmarks;
mod database;
mod file_history;
mod migrations;
mod schema;
mod session;

pub use bookmarks::{Bookmark, BookmarkStore};
pub use database::Database;
pub use file_history::FileHistoryStore;
pub use session::{SessionData, SessionStore, TabData, TabState};

/// Ids deleted per `DELETE … IN (…)` statement. SQLite rejects more than 32766
/// bound parameters per statement, so a large orphan set must be deleted in
/// batches or the cleanup fails outright.
const DELETE_BATCH_SIZE: usize = 500;

/// Removes rows whose `path` column no longer exists on disk.
/// `id_column` is the column used to identify rows for deletion (e.g. `id` or `path`).
/// Returns the paths of the deleted rows (may contain duplicates when several
/// rows share one path).
///
/// Takes the connection handle rather than a lock guard: statting user paths
/// happens between two short lock windows, so an unreachable mount cannot stall
/// every other query.
fn delete_orphans(
    conn: &Mutex<rusqlite::Connection>,
    table_name: &str,
    id_column: &str,
) -> anyhow::Result<Vec<String>> {
    let entries: Vec<(String, String)> = {
        let conn = conn.lock_or_recover();
        let select_sql = format!("SELECT {}, path FROM {}", id_column, table_name);
        let mut stmt = conn.prepare(&select_sql)?;
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<rusqlite::Result<Vec<(String, String)>>>()?
    };

    let dead: Vec<(String, String)> = entries
        .into_iter()
        .filter(|(_, path)| is_missing(Path::new(path)))
        .collect();

    if dead.is_empty() {
        return Ok(Vec::new());
    }

    let conn = conn.lock_or_recover();
    for batch in dead.chunks(DELETE_BATCH_SIZE) {
        let placeholders = (1..=batch.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("DELETE FROM {} WHERE {} IN ({})", table_name, id_column, placeholders);
        let params: Vec<&dyn rusqlite::types::ToSql> =
            batch.iter().map(|(id, _)| id as &dyn rusqlite::types::ToSql).collect();
        conn.execute(&sql, params.as_slice())?;
    }

    Ok(dead.into_iter().map(|(_, path)| path).collect())
}

/// Only a definitive "not found" makes a row dead. Permission errors and
/// unreachable mounts (including a dangling symlink target) keep the row: the
/// entry is not provably gone, and deleting it loses history the user cannot
/// get back.
fn is_missing(path: &Path) -> bool {
    match std::fs::symlink_metadata(path) {
        Ok(_) => false,
        Err(e) => e.kind() == std::io::ErrorKind::NotFound,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_util::make_temp_dir;
    use std::fs;

    fn bookmark(id: &str, path: &str) -> Bookmark {
        Bookmark {
            id: id.to_string(),
            path: path.to_string(),
            title: "Title".to_string(),
            tags: Vec::new(),
            created: "2026-01-01".to_string(),
            last_accessed: None,
        }
    }

    #[test]
    fn deletes_only_rows_whose_path_is_definitively_gone() {
        let dir = make_temp_dir("orphans");
        let db = Database::new(dir.join("db.sqlite")).unwrap();
        let live = dir.join("live.md");
        let gone = dir.join("gone.md");
        fs::write(&live, "x").unwrap();

        db.bookmarks()
            .add_bookmark(&bookmark("live", &live.to_string_lossy()))
            .unwrap();
        db.bookmarks()
            .add_bookmark(&bookmark("gone", &gone.to_string_lossy()))
            .unwrap();

        let deleted = db.bookmarks().delete_orphan_bookmarks().unwrap();

        assert_eq!(deleted, vec![gone.to_string_lossy().to_string()]);
        let left = db.bookmarks().get_all_bookmarks().unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].path, live.to_string_lossy().to_string());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn keeps_rows_that_cannot_be_statted() {
        use std::os::unix::fs::PermissionsExt;

        let dir = make_temp_dir("orphan-eacces");
        let db = Database::new(dir.join("db.sqlite")).unwrap();
        let locked = dir.join("locked");
        fs::create_dir(&locked).unwrap();
        let kept = locked.join("kept.md");
        fs::write(&kept, "x").unwrap();

        db.bookmarks()
            .add_bookmark(&bookmark("kept", &kept.to_string_lossy()))
            .unwrap();

        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        if fs::symlink_metadata(&kept).is_ok() {
            // Running with CAP_DAC_OVERRIDE (e.g. root): the permission error
            // cannot be produced, so there is nothing to assert.
            fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
            fs::remove_dir_all(&dir).unwrap();
            return;
        }

        let deleted = db.bookmarks().delete_orphan_bookmarks().unwrap();

        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(
            deleted.is_empty(),
            "row deleted despite an unreadable parent: {:?}",
            deleted
        );
        assert_eq!(db.bookmarks().get_all_bookmarks().unwrap().len(), 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn deletes_orphans_that_span_more_than_one_delete_batch() {
        let dir = make_temp_dir("orphans-batches");
        let db = Database::new(dir.join("db.sqlite")).unwrap();
        let total = DELETE_BATCH_SIZE + 1;

        for i in 0..total {
            let path = dir.join(format!("gone-{i}.md"));
            db.bookmarks()
                .add_bookmark(&bookmark(&format!("gone-{i}"), &path.to_string_lossy()))
                .unwrap();
        }

        let deleted = db.bookmarks().delete_orphan_bookmarks().unwrap();

        assert_eq!(deleted.len(), total);
        assert!(db.bookmarks().get_all_bookmarks().unwrap().is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }
}
