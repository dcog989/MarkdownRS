use crate::state::AppState;
use crate::utils;
use crate::utils::RwLockExt;
use anyhow::{Result, anyhow};
use std::sync::Arc;
use tauri::Manager;
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

pub async fn add_to_dictionary_inner(app_handle: tauri::AppHandle, word: String) -> Result<()> {
    let config_dir = utils::app_config_dir(&app_handle)
        .map_err(|e| anyhow!("Failed to get app config directory: {}", e))?;
    let dict_path = utils::custom_dict_path(&config_dir);

    if !config_dir.exists()
        && let Err(e) = fs::create_dir_all(&config_dir).await
    {
        log::warn!("Failed to create app directory: {}", e);
    }

    let word_exists = if dict_path.exists() {
        match fs::read_to_string(&dict_path).await {
            Ok(c) => c.lines().any(|l| l.trim().eq_ignore_ascii_case(&word)),
            Err(_) => false,
        }
    } else {
        false
    };

    if !word_exists {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dict_path)
            .await
            .map_err(|e| anyhow!("Failed to open dictionary: {}", e))?;

        let line = format!("{}\n", word);
        file.write_all(line.as_bytes())
            .await
            .map_err(|e| anyhow!("Failed to write word: {}", e))?;
    }

    let state = app_handle.state::<AppState>();
    let mut custom_dict = state.custom_dict.write_or_recover();
    Arc::make_mut(&mut custom_dict).insert(word.to_lowercase());

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
