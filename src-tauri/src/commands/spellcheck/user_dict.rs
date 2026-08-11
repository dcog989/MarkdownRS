use crate::state::AppState;
use crate::utils;
use crate::utils::RwLockExt;
use anyhow::{Result, anyhow};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::Manager;
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

pub async fn add_to_dictionary_inner(app_handle: tauri::AppHandle, word: String) -> Result<()> {
    add_words_to_dictionary_inner(app_handle, vec![word]).await
}

pub async fn add_words_to_dictionary_inner(
    app_handle: tauri::AppHandle,
    words: Vec<String>,
) -> Result<()> {
    let config_dir = utils::app_config_dir(&app_handle)
        .map_err(|e| anyhow!("Failed to get app config directory: {}", e))?;
    let dict_path = utils::custom_dict_path(&config_dir);

    if !config_dir.exists()
        && let Err(e) = fs::create_dir_all(&config_dir).await
    {
        log::warn!("Failed to create app directory: {}", e);
    }

    // Load the existing words once so repeated additions are deduplicated in a
    // single file read instead of one read+append per word.
    let mut existing: HashSet<String> = if dict_path.exists() {
        match fs::read_to_string(&dict_path).await {
            Ok(c) => c
                .lines()
                .map(|l| l.trim().to_lowercase())
                .filter(|l| !l.is_empty())
                .collect(),
            Err(_) => HashSet::new(),
        }
    } else {
        HashSet::new()
    };

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
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dict_path)
            .await
            .map_err(|e| anyhow!("Failed to open dictionary: {}", e))?;

        let mut buf = String::with_capacity(new_words.iter().map(|w| w.len() + 1).sum());
        for w in &new_words {
            buf.push_str(w);
            buf.push('\n');
        }
        file.write_all(buf.as_bytes())
            .await
            .map_err(|e| anyhow!("Failed to write words: {}", e))?;
    }

    if !new_words.is_empty() {
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
    let config_dir = utils::app_config_dir(&app_handle)
        .map_err(|e| anyhow!("Failed to get app config directory: {}", e))?;
    let dict_path = utils::custom_dict_path(&config_dir);

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
