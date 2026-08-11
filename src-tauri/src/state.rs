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

/// The dictionary selection currently loaded into `speller`.
/// `None` means the spellchecker has never been initialized.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpellcheckConfig {
    dict_codes: Vec<String>,
    enable_technical: bool,
    enable_science: bool,
}

#[cfg_attr(not(feature = "spellcheck"), allow(dead_code))]
impl SpellcheckConfig {
    pub fn new(dict_codes: &[String], enable_technical: bool, enable_science: bool) -> Self {
        let mut dict_codes = dict_codes.to_vec();
        dict_codes.sort();
        Self {
            dict_codes,
            enable_technical,
            enable_science,
        }
    }
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
    /// The dictionary selection the current speller was built from, so a
    /// re-init only happens when the requested selection actually changes.
    #[cfg_attr(not(feature = "spellcheck"), allow(dead_code))]
    pub loaded_spellcheck_config: Mutex<Option<SpellcheckConfig>>,
    /// Monotonic id of the latest accepted spellcheck init request. A build
    /// that finishes with a stale generation (a newer request superseded it)
    /// discards its result instead of clobbering state.
    #[cfg_attr(not(feature = "spellcheck"), allow(dead_code))]
    pub spellcheck_init_gen: AtomicU64,
    /// Cached value of the `maxFileSizeMB` setting converted to bytes.
    /// Initialised to `MAX_FILE_SIZE_UNSET`; written once at startup and on
    /// every `save_settings` call, so reads never need a lock.
    pub max_file_size_bytes: AtomicU64,
    /// Cached `workspaceRoot` from settings, populated on first `load_settings`.
    pub project_root: Mutex<Option<PathBuf>>,
}
