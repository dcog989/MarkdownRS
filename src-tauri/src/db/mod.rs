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
fn delete_orphans(
    conn: &rusqlite::Connection,
    table_name: &str,
    id_column: &str,
) -> anyhow::Result<usize> {
    let select_sql = format!("SELECT {}, path FROM {}", id_column, table_name);
    let entries: Vec<(String, String)> = {
        let mut stmt = conn.prepare(&select_sql)?;
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<rusqlite::Result<Vec<(String, String)>>>()?
    };

    let dead_ids: Vec<&str> = entries
        .iter()
        .filter(|(_, path)| !std::path::Path::new(path).exists())
        .map(|(id, _)| id.as_str())
        .collect();

    if dead_ids.is_empty() {
        return Ok(0);
    }

    let placeholders = (1..=dead_ids.len())
        .map(|i| format!("?{}", i))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "DELETE FROM {} WHERE {} IN ({})",
        table_name, id_column, placeholders
    );
    let params: Vec<&dyn rusqlite::types::ToSql> = dead_ids
        .iter()
        .map(|id| id as &dyn rusqlite::types::ToSql)
        .collect();
    conn.execute(&sql, params.as_slice())?;

    Ok(dead_ids.len())
}
