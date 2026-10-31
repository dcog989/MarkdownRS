use anyhow::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Bookmark {
    pub id: String,
    pub path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub created: String,
    pub last_accessed: Option<String>,
}

const UPSERT_SQL: &str = "INSERT OR REPLACE INTO bookmarks (id, path, title, tags, created, last_accessed)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)";

fn bind_bookmark(bookmark: &Bookmark) -> Result<[Box<dyn rusqlite::types::ToSql + '_>; 6]> {
    let tags_json = serde_json::to_string(&bookmark.tags)?;
    Ok([
        Box::new(&bookmark.id) as Box<dyn rusqlite::types::ToSql>,
        Box::new(&bookmark.path),
        Box::new(&bookmark.title),
        Box::new(tags_json),
        Box::new(&bookmark.created),
        Box::new(&bookmark.last_accessed),
    ])
}

pub struct BookmarkStore {
    conn: Arc<Mutex<rusqlite::Connection>>,
}

impl BookmarkStore {
    pub(crate) fn new(conn: Arc<Mutex<rusqlite::Connection>>) -> Self {
        Self { conn }
    }

    pub fn add_bookmark(&self, bookmark: &Bookmark) -> Result<()> {
        let conn = lock_conn!(self);
        let params = bind_bookmark(bookmark)?;
        conn.execute(UPSERT_SQL, params)?;
        Ok(())
    }

    pub fn get_all_bookmarks(&self) -> Result<Vec<Bookmark>> {
        let conn = lock_conn!(self);
        let mut stmt =
            conn.prepare("SELECT id, path, title, tags, created, last_accessed FROM bookmarks ORDER BY created DESC")?;

        let bookmarks = stmt
            .query_map([], |row| {
                let tags_json: String = row.get(3)?;
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
                Ok(Bookmark {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    tags,
                    created: row.get(4)?,
                    last_accessed: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(bookmarks)
    }

    pub fn delete_bookmark(&self, id: &str) -> Result<()> {
        let conn = lock_conn!(self);
        conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_bookmark_access_time(&self, id: &str, last_accessed: &str) -> Result<()> {
        let conn = lock_conn!(self);
        conn.execute(
            "UPDATE bookmarks SET last_accessed = ?1 WHERE id = ?2",
            params![last_accessed, id],
        )?;
        Ok(())
    }

    pub fn delete_orphan_bookmarks(&self) -> Result<Vec<String>> {
        crate::db::delete_orphans(&self.conn, "bookmarks", "id")
    }

    pub fn import_bookmarks(&self, bookmarks: &[Bookmark]) -> Result<()> {
        if bookmarks.is_empty() {
            return Ok(());
        }
        let mut conn = lock_conn!(self);
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(UPSERT_SQL)?;
            for bookmark in bookmarks {
                let params = bind_bookmark(bookmark)?;
                stmt.execute(params)?;
            }
        }
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

    fn bookmark(id: &str, path: &str) -> Bookmark {
        Bookmark {
            id: id.to_string(),
            path: path.to_string(),
            title: "Title".to_string(),
            tags: Vec::new(),
            created: "20260101 / 000000".to_string(),
            last_accessed: None,
        }
    }

    #[test]
    fn re_bookmarking_a_renamed_path_updates_the_existing_row() {
        let dir = make_temp_dir("bookmark-rename");
        let db = Database::new(dir.join("bookmarks.db")).unwrap();
        let store = db.bookmarks();

        // Renaming a bookmarked file keeps the id and changes the path.
        store.add_bookmark(&bookmark("b1", "/old.md")).unwrap();
        store.add_bookmark(&bookmark("b1", "/new.md")).unwrap();

        let all = store.get_all_bookmarks().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "b1");
        assert_eq!(all[0].path, "/new.md");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn import_keeps_one_row_per_id_and_per_path() {
        let dir = make_temp_dir("bookmark-import-dupes");
        let db = Database::new(dir.join("bookmarks.db")).unwrap();
        let store = db.bookmarks();

        // Repeated id, then a different id taking a path the first rows used.
        let imported = vec![
            bookmark("b1", "/a.md"),
            bookmark("b1", "/b.md"),
            bookmark("b3", "/b.md"),
        ];
        store.import_bookmarks(&imported).unwrap();

        let all = store.get_all_bookmarks().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "b3");
        assert_eq!(all[0].path, "/b.md");

        fs::remove_dir_all(&dir).unwrap();
    }
}
