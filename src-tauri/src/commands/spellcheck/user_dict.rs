use crate::state::AppState;
use crate::utils;
use crate::utils::RwLockExt;
use anyhow::{Result, anyhow};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::Manager;
use tokio::fs;
use tokio::sync::Mutex;

/// Serializes the read-modify-write of the shared dictionary file.
static USER_DICT_WRITE: Mutex<()> = Mutex::const_new(());

pub async fn add_to_dictionary_inner(app_handle: tauri::AppHandle, word: String) -> Result<()> {
    add_words_to_dictionary_inner(app_handle, vec![word]).await
}

pub async fn add_words_to_dictionary_inner(app_handle: tauri::AppHandle, words: Vec<String>) -> Result<()> {
    let data_dir = utils::app_data_dir(&app_handle).map_err(|e| anyhow!("Failed to get app data directory: {}", e))?;
    let dict_path = utils::custom_dict_path(&data_dir);

    if !data_dir.exists()
        && let Err(e) = fs::create_dir_all(&data_dir).await
    {
        log::warn!("Failed to create app directory: {}", e);
    }

    let _write_guard = USER_DICT_WRITE.lock().await;

    // Load the existing words once so repeated additions are deduplicated in a
    // single file read instead of one read+append per word.
    let existing_content = match fs::read_to_string(&dict_path).await {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(anyhow!("Failed to read dictionary: {}", e)),
    };
    let mut existing: HashSet<String> = existing_content
        .lines()
        .map(|l| l.trim().to_lowercase())
        .filter(|l| !l.is_empty())
        .collect();

    let mut new_words: Vec<String> = Vec::new();
    for word in words {
        let trimmed = word.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if existing.contains(&lower) {
            continue;
        }
        existing.insert(lower);
        new_words.push(trimmed.to_string());
    }

    if !new_words.is_empty() {
        let mut content = existing_content;
        if !content.is_empty() && !content.ends_with('\n') {
            content.push('\n');
        }
        for w in &new_words {
            content.push_str(w);
            content.push('\n');
        }
        utils::atomic_write(&dict_path, content.as_bytes())
            .await
            .map_err(|e| anyhow!("Failed to write words: {}", e))?;

        let state = app_handle.state::<AppState>();
        let mut custom_dict = state.custom_dict.write_or_recover();
        let set = Arc::make_mut(&mut custom_dict);
        for w in &new_words {
            set.insert(w.to_lowercase());
        }
    }

    Ok(())
}

pub async fn load_user_dictionary_inner(app_handle: tauri::AppHandle) -> Result<Vec<String>> {
    let data_dir = utils::app_data_dir(&app_handle).map_err(|e| anyhow!("Failed to get app data directory: {}", e))?;
    let dict_path = utils::custom_dict_path(&data_dir);

    if !dict_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&dict_path)
        .await
        .map_err(|e| anyhow!("Failed to read custom dictionary: {}", e))?;

    Ok(content
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect())
}
