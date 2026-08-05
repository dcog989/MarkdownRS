use crate::db::Database;
use spellbook::Dictionary;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex, RwLock};

#[derive(Clone, Copy, Debug, PartialEq)]
#[cfg_attr(not(feature = "spellcheck"), allow(dead_code))]
pub enum SpellcheckStatus {
    Uninitialized,
    Loading,
    Ready,
    Failed,
}

/// Sentinel value meaning "not yet loaded from settings".
pub const MAX_FILE_SIZE_UNSET: u64 = u64::MAX;

pub struct AppState {
    pub db: Database,
    #[cfg_attr(not(feature = "spellcheck"), allow(dead_code))]
    pub speller: Arc<Mutex<Option<Vec<Dictionary>>>>,
    /// Custom user dictionary, copy-on-write. Readers clone the cheap `Arc`
    /// (never the `HashSet`), so the per-call `check_words` hot path only pays a
    /// read lock plus an `Arc` clone. Writers mutate in place via `Arc::make_mut`.
    #[cfg_attr(not(feature = "spellcheck"), allow(dead_code))]
    pub custom_dict: RwLock<Arc<HashSet<String>>>,
    #[cfg_attr(not(feature = "spellcheck"), allow(dead_code))]
    pub spellcheck_status: Mutex<SpellcheckStatus>,
    /// Cached value of the `maxFileSizeMB` setting converted to bytes.
    /// Initialised to `MAX_FILE_SIZE_UNSET`; written once at startup and on
    /// every `save_settings` call, so reads never need a lock.
    pub max_file_size_bytes: AtomicU64,
    /// Cached `workspaceRoot` from settings, populated on first `load_settings`.
    pub project_root: Mutex<Option<PathBuf>>,
}
