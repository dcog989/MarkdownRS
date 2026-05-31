use anyhow::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fmt;

use crate::db::Database;

#[derive(Serialize, Deserialize, Clone)]
pub struct TabState {
    pub id: String,
    pub title: String,
    pub content: Option<String>,
    pub is_dirty: bool,
    pub path: Option<String>,
    pub scroll_percentage: f64,
    pub created: Option<String>,
    pub modified: Option<String>,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub custom_title: Option<String>,
    #[serde(default)]
    pub file_check_failed: bool,
    #[serde(default)]
    pub file_check_performed: bool,
    #[serde(default)]
    pub mru_position: Option<i32>,
    #[serde(default)]
    pub sort_index: Option<i32>,
    #[serde(default)]
    pub original_index: Option<i32>,
}

impl TabState {
    pub fn normalize_newlines(&mut self) {
        if let Some(content) = &mut self.content
            && content.contains("\r\n")
        {
            *content = content.replace("\r\n", "\n");
        }
    }
}

impl fmt::Debug for TabState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TabState")
            .field("id", &self.id)
            .field("title", &self.title)
            .field(
                "content",
                &self
                    .content
                    .as_ref()
                    .map(|c| format!("<{} bytes>", c.len()))
                    .unwrap_or_else(|| "<no update>".to_string()),
            )
            .finish()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionData {
    pub active_tabs: Vec<TabState>,
    pub closed_tabs: Vec<TabState>,
}

#[derive(Serialize)]
pub struct TabData {
    pub content: Option<String>,
}

impl Database {
    pub fn save_session(&self, active_tabs: &[TabState], closed_tabs: &[TabState]) -> Result<()> {
        let mut conn = lock_conn!(self);
        let tx = conn.transaction()?;

        self.save_active_tabs(&tx, active_tabs)?;
        self.save_closed_tabs(&tx, closed_tabs)?;

        tx.commit()?;
        Ok(())
    }

    fn save_active_tabs(&self, tx: &rusqlite::Transaction, tabs: &[TabState]) -> Result<()> {
        if tabs.is_empty() {
            tx.execute("DELETE FROM tabs", [])?;
            return Ok(());
        }

        let placeholders = (1..=tabs.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let delete_sql = format!("DELETE FROM tabs WHERE id NOT IN ({})", placeholders);
        let mut delete_stmt = tx.prepare(&delete_sql)?;
        let ids: Vec<&dyn rusqlite::types::ToSql> = tabs
            .iter()
            .map(|t| &t.id as &dyn rusqlite::types::ToSql)
            .collect();
        delete_stmt.execute(ids.as_slice())?;

        let mut upsert_stmt = tx.prepare_cached(
            "INSERT INTO tabs (
                id, title, content, is_dirty, path, scroll_percentage,
                created, modified, is_pinned, custom_title,
                file_check_failed, file_check_performed, mru_position, sort_index
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
                title              = excluded.title,
                content            = CASE WHEN excluded.content IS NOT NULL
                                          THEN excluded.content
                                          ELSE tabs.content END,
                is_dirty           = excluded.is_dirty,
                path               = excluded.path,
                scroll_percentage  = excluded.scroll_percentage,
                created            = excluded.created,
                modified           = excluded.modified,
                is_pinned          = excluded.is_pinned,
                custom_title       = excluded.custom_title,
                file_check_failed  = excluded.file_check_failed,
                file_check_performed = excluded.file_check_performed,
                mru_position       = excluded.mru_position,
                sort_index         = excluded.sort_index",
        )?;

        for tab in tabs {
            let content = tab.content.as_deref().filter(|c| !c.is_empty());
            upsert_stmt.execute(params![
                &tab.id,
                &tab.title,
                content,
                tab.is_dirty as i32,
                &tab.path,
                tab.scroll_percentage,
                &tab.created,
                &tab.modified,
                tab.is_pinned as i32,
                &tab.custom_title,
                tab.file_check_failed as i32,
                tab.file_check_performed as i32,
                &tab.mru_position,
                &tab.sort_index,
            ])?;
        }

        Ok(())
    }

    fn save_closed_tabs(&self, tx: &rusqlite::Transaction, tabs: &[TabState]) -> Result<()> {
        if tabs.is_empty() {
            tx.execute("DELETE FROM closed_tabs", [])?;
            return Ok(());
        }

        let placeholders = (1..=tabs.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let delete_sql = format!("DELETE FROM closed_tabs WHERE id NOT IN ({})", placeholders);
        let mut delete_stmt = tx.prepare(&delete_sql)?;
        let ids: Vec<&dyn rusqlite::types::ToSql> = tabs
            .iter()
            .map(|t| &t.id as &dyn rusqlite::types::ToSql)
            .collect();
        delete_stmt.execute(ids.as_slice())?;

        let mut upsert_stmt = tx.prepare_cached(
            "INSERT INTO closed_tabs (
                id, title, content, is_dirty, path, scroll_percentage,
                created, modified, is_pinned, custom_title,
                file_check_failed, file_check_performed, mru_position, sort_index, original_index
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ON CONFLICT(id) DO UPDATE SET
                title              = excluded.title,
                content            = CASE WHEN excluded.content IS NOT NULL
                                          THEN excluded.content
                                          ELSE closed_tabs.content END,
                is_dirty           = excluded.is_dirty,
                path               = excluded.path,
                scroll_percentage  = excluded.scroll_percentage,
                created            = excluded.created,
                modified           = excluded.modified,
                is_pinned          = excluded.is_pinned,
                custom_title       = excluded.custom_title,
                file_check_failed  = excluded.file_check_failed,
                file_check_performed = excluded.file_check_performed,
                mru_position       = excluded.mru_position,
                sort_index         = excluded.sort_index,
                original_index     = excluded.original_index",
        )?;

        for tab in tabs.iter() {
            let content = tab.content.as_deref().filter(|c| !c.is_empty());
            upsert_stmt.execute(params![
                &tab.id,
                &tab.title,
                content,
                tab.is_dirty as i32,
                &tab.path,
                tab.scroll_percentage,
                &tab.created,
                &tab.modified,
                tab.is_pinned as i32,
                &tab.custom_title,
                tab.file_check_failed as i32,
                tab.file_check_performed as i32,
                &tab.mru_position,
                &tab.sort_index,
                &tab.original_index,
            ])?;
        }

        Ok(())
    }

    pub fn load_session(&self) -> Result<SessionData> {
        let conn = lock_conn!(self);

        let mut active_stmt = conn.prepare(
            "SELECT id, title, NULL as content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed, mru_position, sort_index
             FROM tabs ORDER BY sort_index ASC",
        )?;

        let active_tabs = active_stmt
            .query_map([], |row| {
                Ok(TabState {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: None,
                    is_dirty: row.get::<_, i32>(3)? != 0,
                    path: row.get(4)?,
                    scroll_percentage: row.get(5)?,
                    created: row.get(6)?,
                    modified: row.get(7)?,
                    is_pinned: row.get::<_, i32>(8)? != 0,
                    custom_title: row.get(9)?,
                    file_check_failed: row.get::<_, i32>(10)? != 0,
                    file_check_performed: row.get::<_, i32>(11)? != 0,
                    mru_position: row.get(12)?,
                    sort_index: row.get(13)?,
                    original_index: None,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut closed_stmt = conn.prepare(
            "SELECT id, title, NULL as content, is_dirty, path, scroll_percentage, created, modified, is_pinned, custom_title, file_check_failed, file_check_performed, mru_position, sort_index, original_index
             FROM closed_tabs ORDER BY sort_index ASC",
        )?;

        let closed_tabs = closed_stmt
            .query_map([], |row| {
                Ok(TabState {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: None,
                    is_dirty: row.get::<_, i32>(3)? != 0,
                    path: row.get(4)?,
                    scroll_percentage: row.get(5)?,
                    created: row.get(6)?,
                    modified: row.get(7)?,
                    is_pinned: row.get::<_, i32>(8)? != 0,
                    custom_title: row.get(9)?,
                    file_check_failed: row.get::<_, i32>(10)? != 0,
                    file_check_performed: row.get::<_, i32>(11)? != 0,
                    mru_position: row.get(12)?,
                    sort_index: row.get(13)?,
                    original_index: row.get(14)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(SessionData {
            active_tabs,
            closed_tabs,
        })
    }

    pub fn load_tab_data(&self, tab_id: &str) -> Result<TabData> {
        let conn = lock_conn!(self);
        let content = conn
            .query_row(
                "SELECT content FROM tabs WHERE id = ?1
                 UNION ALL
                 SELECT content FROM closed_tabs WHERE id = ?1
                 LIMIT 1",
                params![tab_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => anyhow::anyhow!("Tab not found"),
                _ => anyhow::anyhow!(e),
            })?;

        Ok(TabData { content })
    }
}
