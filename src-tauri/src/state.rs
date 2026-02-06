use crate::db::Database;
use spellbook::Dictionary;
use std::collections::HashSet;
use tokio::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SpellcheckStatus {
    Uninitialized,
    Loading,
    Ready,
    Failed,
}

pub struct AppState {
    pub db: Database,
    pub speller: Mutex<Option<Dictionary>>,
    pub custom_dict: Mutex<HashSet<String>>,
    pub spellcheck_status: Mutex<SpellcheckStatus>,
}
