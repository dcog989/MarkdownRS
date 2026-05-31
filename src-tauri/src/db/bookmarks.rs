use anyhow::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Bookmark {
    pub id: String,
    pub path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub created: String,
    pub last_accessed: Option<String>,
}

impl Database {
    pub fn add_bookmark(&self, bookmark: &Bookmark) -> Result<()> {
        let conn = lock_conn!(self);
        let tags_json = serde_json::to_string(&bookmark.tags)?;
        conn.execute(
            "INSERT INTO bookmarks (id, path, title, tags, created, last_accessed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(path) DO UPDATE SET
                id            = excluded.id,
                title         = excluded.title,
                tags          = excluded.tags,
                last_accessed = excluded.last_accessed",
            params![
                &bookmark.id,
                &bookmark.path,
                &bookmark.title,
                &tags_json,
                &bookmark.created,
                &bookmark.last_accessed,
            ],
        )?;
        Ok(())
    }

    pub fn get_all_bookmarks(&self) -> Result<Vec<Bookmark>> {
        let conn = lock_conn!(self);
        let mut stmt = conn.prepare(
            "SELECT id, path, title, tags, created, last_accessed FROM bookmarks ORDER BY created DESC"
        )?;

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

    pub fn delete_orphan_bookmarks(&self) -> Result<usize> {
        let conn = lock_conn!(self);
        let entries: Vec<(String, String)> = {
            let mut stmt = conn.prepare("SELECT id, path FROM bookmarks")?;
            stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<rusqlite::Result<Vec<(String, String)>>>()?
        };

        let dead_ids: Vec<&str> = entries
            .iter()
            .filter(|(_, path)| !std::path::Path::new(path.as_str()).exists())
            .map(|(id, _)| id.as_str())
            .collect();

        if dead_ids.is_empty() {
            return Ok(0);
        }

        let placeholders = (1..=dead_ids.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("DELETE FROM bookmarks WHERE id IN ({})", placeholders);
        let params: Vec<&dyn rusqlite::types::ToSql> = dead_ids
            .iter()
            .map(|id| id as &dyn rusqlite::types::ToSql)
            .collect();
        conn.execute(&sql, params.as_slice())?;

        Ok(dead_ids.len())
    }

    pub fn import_bookmarks(&self, bookmarks: &[Bookmark]) -> Result<()> {
        if bookmarks.is_empty() {
            return Ok(());
        }
        let mut conn = lock_conn!(self);
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO bookmarks (id, path, title, tags, created, last_accessed)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(path) DO UPDATE SET
                    id            = excluded.id,
                    title         = excluded.title,
                    tags          = excluded.tags,
                    created       = excluded.created,
                    last_accessed = excluded.last_accessed",
            )?;
            for bookmark in bookmarks {
                let tags_json = serde_json::to_string(&bookmark.tags)?;
                stmt.execute(params![
                    &bookmark.id,
                    &bookmark.path,
                    &bookmark.title,
                    tags_json,
                    &bookmark.created,
                    &bookmark.last_accessed,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }
}
