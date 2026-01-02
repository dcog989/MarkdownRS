use crate::state::AppState;
use spellbook::Dictionary;
use tauri::{Manager, State};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub async fn add_to_dictionary(app_handle: tauri::AppHandle, word: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| {
        log::error!("Failed to get app data directory: {}", e);
        format!("Failed to access app data: {}", e)
    })?;
    let dict_path = app_dir.join("custom-spelling.dic");
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).await.map_err(|e| {
            log::error!("Failed to create app data directory: {}", e);
            format!("Failed to create directory: {}", e)
        })?;
    }

    let word_exists = if dict_path.exists() {
        let content = fs::read_to_string(&dict_path).await.map_err(|e| {
            log::error!("Failed to read custom dictionary: {}", e);
            format!("Failed to read dictionary: {}", e)
        })?;
        content
            .lines()
            .any(|line| line.trim().eq_ignore_ascii_case(&word))
    } else {
        false
    };

    if !word_exists {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dict_path)
            .await
            .map_err(|e| {
                log::error!("Failed to open custom dictionary for writing: {}", e);
                format!("Failed to open dictionary: {}", e)
            })?;

        let line = format!("{}\n", word);
        if let Err(e) = file.write_all(line.as_bytes()).await {
            log::error!("Failed to write word '{}' to dictionary: {}", word, e);
            return Err(format!("Failed to write to dictionary: {}", e));
        } else {
            log::info!("Added word '{}' to custom dictionary", word);
        }
    }

    let state = app_handle.state::<AppState>();
    let mut custom_dict = state.custom_dict.lock().await;
    custom_dict.insert(word.to_lowercase());

    Ok(())
}

#[tauri::command]
pub async fn get_custom_dictionary(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| {
        log::error!(
            "Failed to get app data directory for custom dictionary: {}",
            e
        );
        format!("Failed to access dictionary: {}", e)
    })?;
    let dict_path = app_dir.join("custom-spelling.dic");
    if !dict_path.exists() {
        log::debug!("Custom dictionary does not exist yet");
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&dict_path).await.map_err(|e| {
        log::error!("Failed to read custom dictionary: {}", e);
        format!("Failed to read dictionary: {}", e)
    })?;

    let words: Vec<String> = content
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    Ok(words)
}

#[tauri::command]
pub async fn init_spellchecker(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    dictionaries: Option<Vec<String>>,
) -> Result<(), String> {
    let dict_codes = dictionaries.unwrap_or_else(|| vec!["en".to_string()]);

    log::info!(
        "Initializing spellchecker with dictionaries: {:?}",
        dict_codes
    );
    let local_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        log::error!("Failed to get local data directory: {}", e);
        format!("Failed to initialize spellchecker: {}", e)
    })?;
    let cache_dir = local_dir.join("spellcheck_cache");

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let custom_path = app_dir.join("custom-spelling.dic");

    let speller_arc = state.speller.clone();
    let custom_arc = state.custom_dict.clone();

    if !cache_dir.exists() {
        log::info!("Creating spellcheck cache directory: {:?}", cache_dir);
        fs::create_dir_all(&cache_dir).await.map_err(|e| {
            log::error!("Failed to create spellcheck cache directory: {}", e);
            format!("Failed to create cache directory: {}", e)
        })?;
    }

    let mut combined_aff = String::new();
    let mut combined_dic_lines: Vec<String> = Vec::new();
    let mut first_dict = true;

    let client = reqwest::Client::new();

    for dict_code in &dict_codes {
        let aff_path = cache_dir.join(format!("{}.aff", dict_code));
        let dic_path = cache_dir.join(format!("{}.dic", dict_code));

        if !aff_path.exists() || !dic_path.exists() {
            log::info!("Downloading dictionary: {}", dict_code);

            let aff_url = format!(
                "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/{}/index.aff",
                dict_code
            );
            let dic_url = format!(
                "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/{}/index.dic",
                dict_code
            );

            if let Ok(resp) = client.get(&aff_url).send().await {
                if resp.status().is_success() {
                    if let Ok(text) = resp.text().await {
                        log::info!("Downloaded .aff file for {}", dict_code);
                        let _ = fs::write(&aff_path, text).await;
                    }
                }
            }

            if let Ok(resp) = client.get(&dic_url).send().await {
                if resp.status().is_success() {
                    if let Ok(text) = resp.text().await {
                        log::info!("Downloaded .dic file for {}", dict_code);
                        let _ = fs::write(&dic_path, text).await;
                    }
                }
            }
        }

        if aff_path.exists() && dic_path.exists() {
            if let (Ok(aff_content), Ok(dic_content)) = (
                fs::read_to_string(&aff_path).await,
                fs::read_to_string(&dic_path).await,
            ) {
                if first_dict {
                    combined_aff = aff_content.trim_start_matches('\u{feff}').to_string();
                    first_dict = false;
                }

                let dic_clean = dic_content.trim_start_matches('\u{feff}');
                let mut lines: Vec<&str> = dic_clean.lines().collect();
                if !lines.is_empty() {
                    lines.remove(0);
                    for line in &lines {
                        if !line.trim().is_empty() {
                            combined_dic_lines.push(line.to_string());
                        }
                    }
                }

                log::info!("Loaded dictionary: {} ({} words)", dict_code, lines.len());
            }
        } else {
            log::warn!("Dictionary files not found for: {}", dict_code);
        }
    }

    let jargon_path = cache_dir.join("jargon.dic");
    if !jargon_path.exists() {
        log::info!("Downloading jargon dictionary");
        if let Ok(resp) = client
            .get("https://raw.githubusercontent.com/smoeding/hunspell-jargon/master/jargon.dic")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    log::info!("Downloaded jargon dictionary");
                    let _ = fs::write(&jargon_path, text).await;
                }
            }
        }
    }

    if jargon_path.exists() {
        if let Ok(jargon_content) = fs::read_to_string(&jargon_path).await {
            let mut lines: Vec<&str> = jargon_content.lines().collect();
            if !lines.is_empty() {
                lines.remove(0);
                for line in &lines {
                    if !line.trim().is_empty() {
                        combined_dic_lines.push(line.to_string());
                    }
                }
            }
            log::info!("Loaded jargon dictionary");
        }
    }

    if !combined_aff.is_empty() && !combined_dic_lines.is_empty() {
        let combined_dic = format!(
            "{}\n{}",
            combined_dic_lines.len(),
            combined_dic_lines.join("\n")
        );

        // spellbook::Dictionary::new is CPU bound and synchronous (computation),
        // so it's safe to call here without blocking an async runtime's I/O resources
        match Dictionary::new(&combined_aff, &combined_dic) {
            Ok(dict) => {
                let mut speller = speller_arc.lock().await;
                *speller = Some(dict);
                log::info!(
                    "Spellchecker initialized successfully with {} dictionaries ({} total words)",
                    dict_codes.len(),
                    combined_dic_lines.len()
                );
            }
            Err(e) => {
                log::error!(
                    "[Spellcheck] Failed to create dictionary: {:?} - This may indicate corrupted cache files",
                    e
                );
                return Err(format!("Failed to create spellchecker: {:?}", e));
            }
        }
    } else {
        log::warn!("[Spellcheck] No dictionary content available after download/merge");
        return Err("Failed to load dictionaries".to_string());
    }

    if custom_path.exists() {
        if let Ok(text) = fs::read_to_string(&custom_path).await {
            let mut custom = custom_arc.lock().await;
            for line in text.lines() {
                let w = line.trim();
                if !w.is_empty() {
                    custom.insert(w.to_lowercase());
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn check_words(
    state: State<'_, AppState>,
    words: Vec<String>,
) -> Result<Vec<String>, String> {
    let speller_arc = state.speller.clone();
    let custom_arc = state.custom_dict.clone();

    // Offload CPU-intensive dictionary lookups to a blocking thread
    let result = tokio::task::spawn_blocking(move || {
        let mut misspelled = Vec::new();

        // Process in chunks to prevent holding the lock for the entire duration.
        // This allows get_spelling_suggestions (which is time-sensitive for UI)
        // to acquire the lock in between chunks if it's waiting.
        for chunk in words.chunks(50) {
            {
                let speller_guard = speller_arc.blocking_lock();
                let custom_guard = custom_arc.blocking_lock();

                if let Some(speller) = speller_guard.as_ref() {
                    for word in chunk {
                        let clean = word.trim();
                        if clean.is_empty() {
                            continue;
                        }

                        let lower = clean.to_lowercase();

                        // Check exact custom match
                        if custom_guard.contains(&lower) {
                            continue;
                        }

                        // Check possessive custom match (e.g. "Svelte's" -> "Svelte")
                        if lower.ends_with("'s") {
                            if let Some(base) = lower.strip_suffix("'s") {
                                if custom_guard.contains(base) {
                                    continue;
                                }
                            }
                        }

                        if !speller.check(clean) {
                            misspelled.push(word.to_string());
                        }
                    }
                }
            } // Locks dropped here

            // Yield to let other threads/tasks (like suggestions) acquire the lock
            std::thread::yield_now();
        }

        Ok::<Vec<String>, String>(misspelled)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}

#[tauri::command]
pub async fn get_spelling_suggestions(
    state: State<'_, AppState>,
    word: String,
) -> Result<Vec<String>, String> {
    let speller_arc = state.speller.clone();

    // Move suggestion logic to blocking thread as well, as 'suggest' can be slow
    // and we want to compete fairly for the lock
    let suggestions = tokio::task::spawn_blocking(move || {
        let speller_guard = speller_arc.blocking_lock();

        let speller = match speller_guard.as_ref() {
            Some(s) => s,
            None => return Ok(Vec::new()),
        };

        let mut suggestions = Vec::new();
        speller.suggest(&word, &mut suggestions);
        Ok::<Vec<String>, String>(suggestions.into_iter().take(5).collect())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(suggestions)
}
