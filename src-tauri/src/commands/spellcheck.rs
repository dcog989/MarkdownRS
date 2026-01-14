use crate::state::AppState;
use spellbook::Dictionary;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::{Manager, State};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

// Helper for atomic file writes to prevent corrupted partial downloads
async fn write_atomic(path: &PathBuf, content: &str) -> std::io::Result<()> {
    let tmp_path = path.with_extension("download.tmp");
    {
        let mut file = fs::File::create(&tmp_path).await?;
        file.write_all(content.as_bytes()).await?;
        file.flush().await?;
    }
    fs::rename(&tmp_path, path).await?;
    Ok(())
}

fn get_technical_url(id: &str) -> Option<&'static str> {
    match id {
        "medical-terms" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/medicalterms/dict/medicalterms-en.txt",
        ),
        "scientific-terms-us" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/scientific_terms_US/src/custom_scientific_US.dic.txt",
        ),
        "software-terms" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/software-terms/dict/softwareTerms.txt",
        ),
        "companies" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/companies/dict/companies.txt",
        ),
        "fullstack" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/fullstack/dict/fullstack.txt",
        ),
        "filetypes" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/filetypes/src/filetypes.txt",
        ),
        _ => None,
    }
}

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
    cache_dir: PathBuf,
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
                    if let Err(e) = write_atomic(&aff_path, &text).await {
                        log::error!("Failed to save .aff file for {}: {}", dict_code, e);
                    }
                }
            } else {
                log::warn!(
                    "Failed to download .aff for {}: Status {}",
                    dict_code,
                    resp.status()
                );
            }
        }

        if let Ok(resp) = dic_res {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if let Err(e) = write_atomic(&dic_path, &text).await {
                        log::error!("Failed to save .dic file for {}: {}", dict_code, e);
                    }
                }
            } else {
                log::warn!(
                    "Failed to download .dic for {}: Status {}",
                    dict_code,
                    resp.status()
                );
            }
        }
    } else {
        log::debug!("Using cached dictionary: {}", dict_code);
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

async fn fetch_technical_dictionary(
    client: reqwest::Client,
    cache_dir: PathBuf,
    id: String,
) -> Result<String, String> {
    let url = get_technical_url(&id).ok_or_else(|| format!("Unknown technical ID: {}", id))?;
    let cache_path = cache_dir.join(format!("{}.txt", id));

    if !cache_path.exists() {
        log::info!("Downloading technical dictionary: {}", id);
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if let Err(e) = write_atomic(&cache_path, &text).await {
                        log::error!("Failed to save technical dict {}: {}", id, e);
                    }
                }
            } else {
                log::warn!(
                    "Failed to download technical dict {}: Status {}",
                    id,
                    resp.status()
                );
            }
        }
    } else {
        log::debug!("Using cached technical dictionary: {}", id);
    }

    if cache_path.exists() {
        fs::read_to_string(&cache_path)
            .await
            .map_err(|e| format!("Failed to read technical file {}: {}", id, e))
    } else {
        Err(format!("Failed to load technical dictionary: {}", id))
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

// List of all technical dictionaries to load when technical_dictionaries is enabled
fn get_all_technical_dictionaries() -> Vec<String> {
    vec![
        "software-terms".to_string(),
        "companies".to_string(),
        "fullstack".to_string(),
        "filetypes".to_string(),
    ]
}

// Separate list for large/medical dictionaries
fn get_scientific_dictionaries() -> Vec<String> {
    vec![
        "medical-terms".to_string(),
        "scientific-terms-us".to_string(),
    ]
}

#[tauri::command]
pub async fn init_spellchecker(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    dictionaries: Option<Vec<String>>,
    technical_dictionaries: Option<bool>,
    science_dictionaries: Option<bool>,
) -> Result<(), String> {
    let dict_codes = dictionaries.unwrap_or_else(|| vec!["en".to_string()]);
    let mut spec_codes = Vec::new();

    if technical_dictionaries.unwrap_or(true) {
        spec_codes.extend(get_all_technical_dictionaries());
    }

    if science_dictionaries.unwrap_or(false) {
        spec_codes.extend(get_scientific_dictionaries());
    }

    log::info!(
        "Initializing spellchecker with dictionaries: {:?}, technical: {}, science: {}",
        dict_codes,
        technical_dictionaries.unwrap_or(true),
        science_dictionaries.unwrap_or(false)
    );
    let local_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        log::error!("Failed to get local data directory: {}", e);
        format!("Failed to initialize spellchecker: {}", e)
    })?;
    let cache_dir = local_dir.join("spellcheck_cache");
    let technical_cache_dir = local_dir.join("spellcheck_cache").join("technical");

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

    if !spec_codes.is_empty() && !technical_cache_dir.exists() {
        fs::create_dir_all(&technical_cache_dir)
            .await
            .map_err(|e| {
                log::error!("Failed to create technical cache directory: {}", e);
                format!("Failed to create technical cache directory: {}", e)
            })?;
    }

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(2))
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

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
        let d = technical_cache_dir.clone();
        spec_tasks.push(tokio::spawn(async move {
            (code.clone(), fetch_technical_dictionary(c, d, code).await)
        }));
    }

    // Collect all results
    let mut dict_results = Vec::new();
    for task in dict_tasks {
        if let Ok((i, res)) = task.await {
            dict_results.push((i, res));
        }
    }
    // Ensure primary dictionary is processed first for AFF selection
    dict_results.sort_by_key(|k| k.0);

    let mut spec_results = Vec::new();
    for task in spec_tasks {
        if let Ok(res) = task.await {
            spec_results.push(res);
        }
    }

    // Processing & Deduplication
    let mut combined_aff = String::new();
    let mut unique_words = HashSet::new();

    for (_, res) in &dict_results {
        match res {
            Ok((aff, dic)) => {
                if combined_aff.is_empty() {
                    combined_aff = aff.trim_start_matches('\u{feff}').to_string();
                }

                let dic_clean = dic.trim_start_matches('\u{feff}');
                for line in dic_clean.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() && !trimmed.chars().all(char::is_numeric) {
                        unique_words.insert(trimmed);
                    }
                }
            }
            Err(e) => log::warn!("Failed to load language dictionary: {}", e),
        }
    }

    for (code, res) in &spec_results {
        match res {
            Ok(content) => {
                let mut count = 0;
                for line in content.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty()
                        && !trimmed.starts_with('#')
                        && !trimmed.starts_with("//")
                    {
                        unique_words.insert(trimmed);
                        count += 1;
                    }
                }
                log::info!("Loaded technical dictionary: {} ({} entries)", code, count);
            }
            Err(e) => log::warn!("Failed to load technical dictionary {}: {}", code, e),
        }
    }

    let total_word_count = unique_words.len();

    if !combined_aff.is_empty() && total_word_count > 0 {
        // Sort for determinism and optimization
        let mut sorted_words: Vec<_> = unique_words.into_iter().collect();
        sorted_words.sort_unstable();

        // Build the final dictionary string
        // Capacity: avg word length ~8 chars + newline = 9. + Header.
        let mut combined_dic = String::with_capacity(total_word_count * 9 + 64);
        combined_dic.push_str(&total_word_count.to_string());
        combined_dic.push('\n');

        for word in sorted_words {
            combined_dic.push_str(word);
            combined_dic.push('\n');
        }

        match Dictionary::new(&combined_aff, &combined_dic) {
            Ok(dict) => {
                let mut speller = state.speller.lock().await;
                *speller = Some(dict);
                log::info!(
                    "Spellchecker initialized successfully with {} unique words",
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
