use anyhow::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::{Arc, Mutex};

use crate::db::schema;

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
    #[serde(default)]
    pub scroll_top: f64,
    #[serde(default)]
    pub top_line: i32,
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

pub struct SessionStore {
    conn: Arc<Mutex<rusqlite::Connection>>,
}

impl SessionStore {
    pub(crate) fn new(conn: Arc<Mutex<rusqlite::Connection>>) -> Self {
        Self { conn }
    }

    pub fn save_session(&self, active_tabs: &[TabState], closed_tabs: &[TabState]) -> Result<()> {
        let mut conn = lock_conn!(self);
        let tx = conn.transaction()?;

        save_tabs(&tx, active_tabs, "tabs")?;
        save_tabs(&tx, closed_tabs, "closed_tabs")?;

        tx.commit()?;
        Ok(())
    }

    pub fn load_session(&self) -> Result<SessionData> {
        let conn = lock_conn!(self);

        fn load_tabs(conn: &rusqlite::Connection, table: &str) -> Result<Vec<TabState>> {
            let sql = format!(
                "SELECT {} FROM {} ORDER BY sort_index ASC",
                schema::tab_columns_for_load_sql(),
                table
            );
            let mut stmt = conn.prepare(&sql)?;
            Ok(stmt
                .query_map([], map_tab_state)?
                .collect::<Result<Vec<_>, _>>()?)
        }

        let active_tabs = load_tabs(&conn, "tabs")?;
        let closed_tabs = load_tabs(&conn, "closed_tabs")?;

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

fn map_tab_state(row: &rusqlite::Row) -> rusqlite::Result<TabState> {
    let col = |name: &str| schema::tab_column_name(name);
    Ok(TabState {
        id: row.get(col("id"))?,
        title: row.get(col("title"))?,
        content: None,
        is_dirty: row.get::<_, i32>(col("is_dirty"))? != 0,
        path: row.get(col("path"))?,
        scroll_percentage: row.get(col("scroll_percentage"))?,
        created: row.get(col("created"))?,
        modified: row.get(col("modified"))?,
        is_pinned: row.get::<_, i32>(col("is_pinned"))? != 0,
        custom_title: row.get(col("custom_title"))?,
        file_check_failed: row.get::<_, i32>(col("file_check_failed"))? != 0,
        file_check_performed: row.get::<_, i32>(col("file_check_performed"))? != 0,
        mru_position: row.get(col("mru_position"))?,
        sort_index: row.get(col("sort_index"))?,
        original_index: row.get(col("original_index"))?,
        scroll_top: row.get(col("scroll_top"))?,
        top_line: row.get(col("top_line"))?,
    })
}

fn save_tabs(tx: &rusqlite::Transaction, tabs: &[TabState], table_name: &str) -> Result<()> {
    if tabs.is_empty() {
        let sql = format!("DELETE FROM {}", table_name);
        tx.execute(&sql, [])?;
        return Ok(());
    }

    let placeholders = (1..=tabs.len())
        .map(|i| format!("?{}", i))
        .collect::<Vec<_>>()
        .join(",");
    let delete_sql = format!(
        "DELETE FROM {} WHERE id NOT IN ({})",
        table_name, placeholders
    );
    let mut delete_stmt = tx.prepare(&delete_sql)?;
    let ids: Vec<&dyn rusqlite::types::ToSql> = tabs
        .iter()
        .map(|t| &t.id as &dyn rusqlite::types::ToSql)
        .collect();
    delete_stmt.execute(ids.as_slice())?;

    let insert_placeholders = (1..=schema::TAB_COLUMNS.len())
        .map(|i| format!("?{}", i))
        .collect::<Vec<_>>()
        .join(", ");
    let update_assignments = schema::TAB_COLUMNS
        .iter()
        .map(|c| {
            if c.preserve_old_on_null {
                format!(
                    "{} = CASE WHEN excluded.{} IS NOT NULL THEN excluded.{} ELSE {}.{} END",
                    c.name, c.name, c.name, table_name, c.name
                )
            } else {
                format!("{} = excluded.{}", c.name, c.name)
            }
        })
        .collect::<Vec<_>>()
        .join(",\n            ");
    let upsert_sql = format!(
        "INSERT INTO {} ({})
         VALUES ({})
         ON CONFLICT(id) DO UPDATE SET
            {}",
        table_name,
        schema::tab_columns_sql(),
        insert_placeholders,
        update_assignments
    );
    let mut upsert_stmt = tx.prepare_cached(&upsert_sql)?;

    for tab in tabs {
        let content = tab.content.as_deref();
        let is_dirty: i32 = tab.is_dirty as i32;
        let is_pinned: i32 = tab.is_pinned as i32;
        let file_check_failed: i32 = tab.file_check_failed as i32;
        let file_check_performed: i32 = tab.file_check_performed as i32;

        upsert_stmt.execute(rusqlite::params![
            &tab.id,
            &tab.title,
            &content,
            &is_dirty,
            &tab.path,
            &tab.scroll_percentage,
            &tab.created,
            &tab.modified,
            &is_pinned,
            &tab.custom_title,
            &file_check_failed,
            &file_check_performed,
            &tab.mru_position,
            &tab.sort_index,
            &tab.original_index,
            &tab.scroll_top,
            &tab.top_line,
        ])?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::utils::test_util::make_temp_dir;

    fn open_db() -> Database {
        let dir = make_temp_dir("session");
        Database::new(dir.join("session.db")).unwrap()
    }

    fn tab(id: &str, content: Option<&str>) -> TabState {
        TabState {
            id: id.to_string(),
            title: "Title".to_string(),
            content: content.map(str::to_string),
            is_dirty: true,
            path: Some(format!("/{}.md", id)),
            scroll_percentage: 42.5,
            scroll_top: 1280.0,
            top_line: 42,
            created: Some("2026-01-01".to_string()),
            modified: None,
            is_pinned: false,
            custom_title: Some("Tab".to_string()),
            file_check_failed: false,
            file_check_performed: true,
            mru_position: Some(3),
            sort_index: Some(0),
            original_index: Some(0),
        }
    }

    #[test]
    fn save_and_load_session_round_trips_all_columns() {
        let db = open_db();
        db.session()
            .save_session(&[tab("a", Some("body"))], &[tab("b", None)])
            .unwrap();

        let loaded = db.session().load_session().unwrap();
        assert_eq!(loaded.active_tabs.len(), 1);
        assert_eq!(loaded.closed_tabs.len(), 1);

        let t = &loaded.active_tabs[0];
        assert_eq!(t.id, "a");
        assert_eq!(t.title, "Title");
        assert_eq!(t.content, None);
        assert!(t.is_dirty);
        assert_eq!(t.path.as_deref(), Some("/a.md"));
        assert_eq!(t.scroll_percentage, 42.5);
        assert_eq!(t.scroll_top, 1280.0);
        assert_eq!(t.top_line, 42);
        assert_eq!(t.created.as_deref(), Some("2026-01-01"));
        assert!(!t.is_pinned);
        assert_eq!(t.custom_title.as_deref(), Some("Tab"));
        assert!(!t.file_check_failed);
        assert!(t.file_check_performed);
        assert_eq!(t.mru_position, Some(3));
        assert_eq!(t.sort_index, Some(0));
        assert_eq!(t.original_index, Some(0));
    }

    #[test]
    fn save_keeps_existing_content_when_incoming_content_is_null() {
        let db = open_db();
        db.session()
            .save_session(&[tab("a", Some("body"))], &[])
            .unwrap();

        let mut without_content = tab("a", None);
        without_content.is_dirty = false;
        db.session().save_session(&[without_content], &[]).unwrap();

        let data = db.session().load_tab_data("a").unwrap();
        assert_eq!(data.content.as_deref(), Some("body"));
    }
}
