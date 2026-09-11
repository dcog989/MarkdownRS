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

/// Removes rows whose `path` column no longer exists on disk.
/// `id_column` is the column used to identify rows for deletion (e.g. `id` or `path`).
/// Returns the paths of the deleted rows (may contain duplicates when several
/// rows share one path).
fn delete_orphans(conn: &rusqlite::Connection, table_name: &str, id_column: &str) -> anyhow::Result<Vec<String>> {
    let select_sql = format!("SELECT {}, path FROM {}", id_column, table_name);
    let entries: Vec<(String, String)> = {
        let mut stmt = conn.prepare(&select_sql)?;
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<rusqlite::Result<Vec<(String, String)>>>()?
    };

    let dead: Vec<(String, String)> = entries
        .into_iter()
        .filter(|(_, path)| !std::path::Path::new(path).exists())
        .collect();

    if dead.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = (1..=dead.len())
        .map(|i| format!("?{}", i))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!("DELETE FROM {} WHERE {} IN ({})", table_name, id_column, placeholders);
    let params: Vec<&dyn rusqlite::types::ToSql> =
        dead.iter().map(|(id, _)| id as &dyn rusqlite::types::ToSql).collect();
    conn.execute(&sql, params.as_slice())?;

    Ok(dead.into_iter().map(|(_, path)| path).collect())
}
