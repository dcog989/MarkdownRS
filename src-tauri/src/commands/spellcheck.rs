use crate::state::AppState;
use spellbook::Dictionary;
use tauri::{Manager, State};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

// Map of ID -> URL
fn get_specialist_url(id: &str) -> Option<&'static str> {
    match id {
        "software-terms" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/software-terms/dict/software-terms.txt",
        ),
        "companies" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/companies/dict/companies.txt",
        ),
        "medical-terms" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/medical-terms/dict/medical-terms.txt",
        ),
        "scientific-terms-us" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/scientific-terms-us/dict/scientific-terms-us.txt",
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

// Map dictionary codes to their URLs (for supported English variants)
fn get_dictionary_urls(dict_code: &str) -> Option<(&'static str, &'static str)> {
    match dict_code {
        "en-US" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_US%20(Marco%20Pinto)%20(-ize)%20(alt)/en_US.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_US%20(Marco%20Pinto)%20(-ize)%20(alt)/en_US.dic",
        )),
        "en-AU" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_AU%20(Marco%20Pinto)%20(-ise)%20(alt)/en_AU.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_AU%20(Marco%20Pinto)%20(-ise)%20(alt)/en_AU.dic",
        )),
        "en-CA" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/refs/heads/main/dictionaries/aoo-mozilla-en-dict/dicts/en_CA%20(Kevin%20Atkinson)/en_CA.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/refs/heads/main/dictionaries/aoo-mozilla-en-dict/dicts/en_CA%20(Kevin%20Atkinson)/en_CA.dic",
        )),
        "en-GB" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_GB%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_GB.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_GB%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_GB.dic",
        )),
        "en-ZA" => Some((
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_ZA%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_ZA.aff",
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/aoo-mozilla-en-dict/dicts/en_ZA%20(Marco%20Pinto)%20(-ise)%20(2025%2B)/en_ZA.dic",
        )),
        _ => None,
    }
}

async fn fetch_standard_dictionary(
    client: reqwest::Client,
    cache_dir: std::path::PathBuf,
    dict_code: String,
) -> Result<(String, String), String> {
    let aff_path = cache_dir.join(format!("{}.aff", dict_code));
    let dic_path = cache_dir.join(format!("{}.dic", dict_code));

    if !aff_path.exists() || !dic_path.exists() {
        log::info!("Downloading dictionary: {}", dict_code);

        let (aff_url, dic_url) = if let Some((aff, dic)) = get_dictionary_urls(&dict_code) {
            (aff.to_string(), dic.to_string())
        } else {
            // Fall back to wooorm/dictionaries for other languages
            (
                format!(
                    "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/{}/index.aff",
                    dict_code
                ),
                format!(
                    "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/{}/index.dic",
                    dict_code
                ),
            )
        };

        // Download concurrently
        let (aff_res, dic_res) =
            tokio::join!(client.get(&aff_url).send(), client.get(&dic_url).send());

        if let Ok(resp) = aff_res {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    let _ = fs::write(&aff_path, text).await;
                }
            }
        }

        if let Ok(resp) = dic_res {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    let _ = fs::write(&dic_path, text).await;
                }
            }
        }
    }

    if aff_path.exists() && dic_path.exists() {
        let (aff, dic) =
            tokio::try_join!(fs::read_to_string(&aff_path), fs::read_to_string(&dic_path))
                .map_err(|e| format!("Failed to read dictionary files for {}: {}", dict_code, e))?;

        Ok((aff, dic))
    } else {
        Err(format!("Dictionary files not found for: {}", dict_code))
    }
}

async fn fetch_specialist_dictionary(
    client: reqwest::Client,
    cache_dir: std::path::PathBuf,
    id: String,
) -> Result<String, String> {
    let url = get_specialist_url(&id).ok_or_else(|| format!("Unknown specialist ID: {}", id))?;
    let cache_path = cache_dir.join(format!("{}.txt", id));

    if !cache_path.exists() {
        log::info!("Downloading specialist dictionary: {}", id);
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    let _ = fs::write(&cache_path, text).await;
                }
            }
        }
    }

    if cache_path.exists() {
        fs::read_to_string(&cache_path)
            .await
            .map_err(|e| format!("Failed to read specialist file {}: {}", id, e))
    } else {
        Err(format!("Failed to load specialist dictionary: {}", id))
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

// List of all technical dictionaries to load when technical_words is enabled
fn get_all_technical_dictionaries() -> Vec<String> {
    vec![
        "software-terms".to_string(),
        "companies".to_string(),
        "medical-terms".to_string(),
        "scientific-terms-us".to_string(),
        "typescript".to_string(),
        "fullstack".to_string(),
        "npm".to_string(),
        "fonts".to_string(),
        "filetypes".to_string(),
        "html".to_string(),
        "css".to_string(),
        "python".to_string(),
        "rust".to_string(),
        "cpp".to_string(),
        "aws".to_string(),
    ]
}

#[tauri::command]
pub async fn init_spellchecker(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    dictionaries: Option<Vec<String>>,
    technical_words: Option<bool>,
) -> Result<(), String> {
    let dict_codes = dictionaries.unwrap_or_else(|| vec!["en".to_string()]);
    let spec_codes = if technical_words.unwrap_or(true) {
        get_all_technical_dictionaries()
    } else {
        Vec::new()
    };

    log::info!(
        "Initializing spellchecker with dictionaries: {:?}, technical words: {}",
        dict_codes,
        technical_words.unwrap_or(true)
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

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(2))
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let mut combined_aff = String::new();
    let mut total_word_count = 0;

    let mut dict_tasks = Vec::new();
    for (i, code) in dict_codes.into_iter().enumerate() {
        let c = client.clone();
        let d = cache_dir.clone();
        dict_tasks.push(tokio::spawn(async move {
            (i, fetch_standard_dictionary(c, d, code).await)
        }));
    }

    let mut spec_tasks = Vec::new();
    for code in spec_codes {
        let c = client.clone();
        let d = specialist_cache_dir.clone();
        spec_tasks.push(tokio::spawn(async move {
            (code.clone(), fetch_specialist_dictionary(c, d, code).await)
        }));
    }

    let mut dict_results = Vec::new();
    for task in dict_tasks {
        if let Ok((i, res)) = task.await {
            dict_results.push((i, res));
        }
    }
    dict_results.sort_by_key(|k| k.0);

    let mut spec_results = Vec::new();
    for task in spec_tasks {
        if let Ok(res) = task.await {
            spec_results.push(res);
        }
    }

    // Calculate total capacity required to minimize re-allocations
    let mut capacity_hint = 0;
    for (_, res) in &dict_results {
        if let Ok((_, dic)) = res {
            capacity_hint += dic.len();
        }
    }
    for (_, res) in &spec_results {
        if let Ok(content) = res {
            capacity_hint += content.len();
        }
    }

    let mut combined_dic_body = String::with_capacity(capacity_hint);

    for (_, res) in dict_results {
        match res {
            Ok((aff, dic)) => {
                if combined_aff.is_empty() {
                    combined_aff = aff.trim_start_matches('\u{feff}').to_string();
                }

                let dic_clean = dic.trim_start_matches('\u{feff}');
                let mut lines = dic_clean.lines();
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
            }
            Err(e) => log::warn!("Failed to load language dictionary: {}", e),
        }
    }

    for (code, res) in spec_results {
        match res {
            Ok(content) => {
                let mut count = 0;
                for line in content.lines() {
                    let trimmed = line.trim();
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
                log::info!("Loaded specialist dictionary: {} ({} words)", code, count);
            }
            Err(e) => log::warn!("Failed to load specialist dictionary {}: {}", code, e),
        }
    }

    if !combined_aff.is_empty() && total_word_count > 0 {
        // Build the final dictionary string efficiently without duplication
        let mut combined_dic = String::with_capacity(combined_dic_body.len() + 16);
        combined_dic.push_str(&total_word_count.to_string());
        combined_dic.push('\n');
        combined_dic.push_str(&combined_dic_body);

        match Dictionary::new(&combined_aff, &combined_dic) {
            Ok(dict) => {
                let mut speller = state.speller.lock().await;
                *speller = Some(dict);
                log::info!(
                    "Spellchecker initialized successfully with {} total words",
                    total_word_count
                );
            }
            Err(e) => {
                log::error!("[Spellcheck] Failed to create dictionary: {:?}", e);
                return Err(format!("Failed to create spellchecker: {:?}", e));
            }
        }
    } else {
        log::warn!("[Spellcheck] No dictionary content available");
        return Err("Failed to load dictionaries".to_string());
    }

    if custom_path.exists() {
        if let Ok(text) = fs::read_to_string(&custom_path).await {
            let mut custom = state.custom_dict.lock().await;
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

                if custom_guard.contains(&lower) {
                    continue;
                }

                if lower.ends_with("'s") {
                    if let Some(base) = lower.strip_suffix("'s") {
                        if custom_guard.contains(base) {
                            continue;
                        }
                    }
                } else if lower.ends_with("s'") {
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
