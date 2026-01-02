use crate::db::Database;
use spellbook::Dictionary;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Database>,
    pub speller: Arc<Mutex<Option<Dictionary>>>,
    pub custom_dict: Arc<Mutex<HashSet<String>>>,
}
