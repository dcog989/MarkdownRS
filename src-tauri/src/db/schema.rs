pub(super) struct TabColumn {
    pub(super) name: &'static str,
    pub(super) ddl: &'static str,
    /// Migration version in which the column was introduced. Columns added in
    /// later versions are excluded from the v1 `CREATE TABLE` and get their own
    /// `ALTER TABLE` migration instead.
    pub(super) since: u32,
    /// When true, `save_tabs` keeps the stored value when the incoming value is NULL.
    pub(super) preserve_old_on_null: bool,
}

/// Single source of truth for the tab schema shared by the `tabs` and
/// `closed_tabs` tables. All SQL (CREATE, SELECT, INSERT, upsert) is generated
/// from this list, so it must remain append-only.
pub(super) const TAB_COLUMNS: &[TabColumn] = &[
    TabColumn {
        name: "id",
        ddl: "TEXT PRIMARY KEY",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "title",
        ddl: "TEXT NOT NULL",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "content",
        ddl: "TEXT",
        since: 1,
        preserve_old_on_null: true,
    },
    TabColumn {
        name: "is_dirty",
        ddl: "INTEGER NOT NULL",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "path",
        ddl: "TEXT",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "scroll_percentage",
        ddl: "REAL NOT NULL",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "created",
        ddl: "TEXT",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "modified",
        ddl: "TEXT",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "is_pinned",
        ddl: "INTEGER DEFAULT 0",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "custom_title",
        ddl: "TEXT",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "file_check_failed",
        ddl: "INTEGER DEFAULT 0",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "file_check_performed",
        ddl: "INTEGER DEFAULT 0",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "mru_position",
        ddl: "INTEGER",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "sort_index",
        ddl: "INTEGER DEFAULT 0",
        since: 1,
        preserve_old_on_null: false,
    },
    TabColumn {
        name: "original_index",
        ddl: "INTEGER",
        since: 5,
        preserve_old_on_null: false,
    },
];

/// Column list for `CREATE TABLE`, restricted to columns available by the given
/// migration version.
pub(super) fn tab_columns_ddl(since: u32) -> String {
    TAB_COLUMNS
        .iter()
        .filter(|c| c.since <= since)
        .map(|c| format!("{} {}", c.name, c.ddl))
        .collect::<Vec<_>>()
        .join(",\n        ")
}

/// Full comma-separated column list for `INSERT`/`SELECT` statements.
pub(super) fn tab_columns_sql() -> String {
    TAB_COLUMNS
        .iter()
        .map(|c| c.name)
        .collect::<Vec<_>>()
        .join(", ")
}

/// `SELECT` column list for session restore; skips the `content` blob, which is
/// loaded on demand via `load_tab_data`.
pub(super) fn tab_columns_for_load_sql() -> String {
    TAB_COLUMNS
        .iter()
        .filter(|c| c.name != "content")
        .map(|c| c.name)
        .collect::<Vec<_>>()
        .join(", ")
}

/// DDL for a single column, used by `ALTER TABLE` migrations.
pub(super) fn tab_column_ddl(name: &str) -> &'static str {
    TAB_COLUMNS
        .iter()
        .find(|c| c.name == name)
        .map(|c| c.ddl)
        .unwrap_or_else(|| panic!("unknown tab column: {name}"))
}

/// Column name for a field in `map_tab_state`.
pub(super) fn tab_column_name(name: &str) -> &'static str {
    TAB_COLUMNS
        .iter()
        .find(|c| c.name == name)
        .map(|c| c.name)
        .unwrap_or_else(|| panic!("unknown tab column: {name}"))
}
