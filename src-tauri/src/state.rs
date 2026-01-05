use crate::db::Database;
use spellbook::Dictionary;
use std::collections::HashSet;
use tokio::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Database>,
    pub speller: Mutex<Option<Dictionary>>,
    pub custom_dict: Mutex<HashSet<String>>,
}
