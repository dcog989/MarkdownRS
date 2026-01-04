use crate::state::AppState;
use spellbook::Dictionary;
use tauri::{Manager, State};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

// Map of ID -> URL
fn get_specialist_url(id: &str) -> Option<&'static str> {
    match id {
        "software-terms" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/software-terms/dict/softwareTerms.txt",
        ),
        "companies" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/companies/dict/companies.txt",
        ),
        "medical-terms" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/medical-terms/dict/medicalTerms.txt",
        ),
        "scientific-terms-us" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/scientific-terms-us/dict/scientificTermsUS.txt",
        ),
        "typescript" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/typescript/dict/typescript.txt",
        ),
        "fullstack" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/fullstack/dict/fullstack.txt",
        ),
        "npm" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/npm/dict/npm.txt",
        ),
        "fonts" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/fonts/dict/fonts.txt",
        ),
        "filetypes" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/filetypes/dict/filetypes.txt",
        ),
        "html" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/html/dict/html.txt",
        ),
        "css" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/css/dict/css.txt",
        ),
        "python" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/python/dict/python.txt",
        ),
        "rust" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/rust/dict/rust.txt",
        ),
        "cpp" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/cpp/dict/cpp.txt",
        ),
        "aws" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aws/dict/aws.txt",
        ),
        _ => None,
    }
}

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
    specialist_dictionaries: Option<Vec<String>>,
) -> Result<(), String> {
    let dict_codes = dictionaries.unwrap_or_else(|| vec!["en".to_string()]);
    let spec_codes = specialist_dictionaries
        .unwrap_or_else(|| vec!["software-terms".to_string(), "companies".to_string()]);

    log::info!(
        "Initializing spellchecker with dictionaries: {:?} and specialist: {:?}",
        dict_codes,
        spec_codes
    );
    let local_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        log::error!("Failed to get local data directory: {}", e);
        format!("Failed to initialize spellchecker: {}", e)
    })?;
    let cache_dir = local_dir.join("spellcheck_cache");
    let specialist_cache_dir = local_dir.join("spellcheck_cache").join("specialist");

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let custom_path = app_dir.join("custom-spelling.dic");

    let speller_arc = state.speller.clone();
    let custom_arc = state.custom_dict.clone();

    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).await.map_err(|e| {
            log::error!("Failed to create spellcheck cache directory: {}", e);
            format!("Failed to create cache directory: {}", e)
        })?;
    }

    if !specialist_cache_dir.exists() {
        fs::create_dir_all(&specialist_cache_dir)
            .await
            .map_err(|e| {
                log::error!("Failed to create specialist cache directory: {}", e);
                format!("Failed to create specialist cache directory: {}", e)
            })?;
    }

    let mut combined_aff = String::new();
    // Pre-allocate buffer (e.g. 5MB) to reduce reallocations
    let mut combined_dic_body = String::with_capacity(5 * 1024 * 1024);
    let mut total_word_count = 0;
    let mut first_dict = true;

    let client = reqwest::Client::new();

    // 1. Load Standard Dictionaries (Affix based)
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
                        let _ = fs::write(&aff_path, text).await;
                    }
                }
            }

            if let Ok(resp) = client.get(&dic_url).send().await {
                if resp.status().is_success() {
                    if let Ok(text) = resp.text().await {
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

                // Use iterator to avoid Vec<String> allocation
                let mut lines = dic_clean.lines();
                // Skip the count line
                if lines.next().is_some() {
                    for line in lines {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            combined_dic_body.push_str(trimmed);
                            combined_dic_body.push('\n');
                            total_word_count += 1;
                        }
                    }
                }

                log::info!("Loaded dictionary: {}", dict_code);
            }
        } else {
            log::warn!("Dictionary files not found for: {}", dict_code);
        }
    }

    // 2. Load Specialist Dictionaries (Simple word lists)
    for spec_id in &spec_codes {
        if let Some(url) = get_specialist_url(spec_id) {
            let cache_path = specialist_cache_dir.join(format!("{}.txt", spec_id));

            if !cache_path.exists() {
                log::info!("Downloading specialist dictionary: {}", spec_id);
                if let Ok(resp) = client.get(url).send().await {
                    if resp.status().is_success() {
                        if let Ok(text) = resp.text().await {
                            let _ = fs::write(&cache_path, text).await;
                        }
                    } else {
                        log::warn!(
                            "Failed to download specialist dictionary: {} (Status: {})",
                            spec_id,
                            resp.status()
                        );
                    }
                }
            }

            if cache_path.exists() {
                if let Ok(content) = fs::read_to_string(&cache_path).await {
                    let mut count = 0;
                    for line in content.lines() {
                        let trimmed = line.trim();
                        // Filter comments and empty lines
                        if !trimmed.is_empty()
                            && !trimmed.starts_with('#')
                            && !trimmed.starts_with("//")
                        {
                            combined_dic_body.push_str(trimmed);
                            combined_dic_body.push('\n');
                            count += 1;
                        }
                    }
                    total_word_count += count;
                    log::info!(
                        "Loaded specialist dictionary: {} ({} words)",
                        spec_id,
                        count
                    );
                }
            }
        }
    }

    if !combined_aff.is_empty() && total_word_count > 0 {
        // Construct final dictionary string with header
        let combined_dic = format!("{}\n{}", total_word_count, combined_dic_body);

        match Dictionary::new(&combined_aff, &combined_dic) {
            Ok(dict) => {
                let mut speller = speller_arc.lock().await;
                *speller = Some(dict);
                log::info!(
                    "Spellchecker initialized successfully with {} total words",
                    total_word_count
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
    let mut misspelled = Vec::new();

    // Process in chunks to prevent holding the lock for the entire duration
    for chunk in words.chunks(50) {
        let speller_guard = state.speller.lock().await;
        let custom_guard = state.custom_dict.lock().await;

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
                } else if lower.ends_with("s'") {
                    // Check plural possessive (e.g. "Users'" -> "Users")
                    if let Some(base) = lower.strip_suffix('\'') {
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

        // Yield to allow other tasks (suggestions) to access the lock
        tokio::task::yield_now().await;
    }

    Ok(misspelled)
}

#[tauri::command]
pub async fn get_spelling_suggestions(
    state: State<'_, AppState>,
    word: String,
) -> Result<Vec<String>, String> {
    let speller_guard = state.speller.lock().await;

    let speller = match speller_guard.as_ref() {
        Some(s) => s,
        None => return Ok(Vec::new()),
    };

    let mut suggestions = Vec::new();
    speller.suggest(&word, &mut suggestions);
    Ok(suggestions.into_iter().take(5).collect())
}
