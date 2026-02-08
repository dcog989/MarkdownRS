use crate::state::AppState;
use spellbook::Dictionary;
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{Manager, State};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

const SPELL_CHECK_CHUNK_SIZE: usize = 50;
const SPELL_CHECK_TIMEOUT_CONNECT: Duration = Duration::from_secs(2);
const SPELL_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_SUGGESTIONS: usize = 5;

// --- Helper Functions ---

/// Generic download helper: Checks cache, downloads if missing, returns content
async fn ensure_file_downloaded(
    client: &reqwest::Client,
    url: &str,
    cache_path: &PathBuf,
    label: &str,
) -> Result<String, String> {
    if !cache_path.exists() {
        log::info!("Downloading {}: {}", label, url);
        match client.get(url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.text().await {
                        Ok(text) => {
                            if let Err(e) =
                                crate::utils::atomic_write(cache_path, text.as_bytes()).await
                            {
                                log::error!("Failed to save {} to {:?}: {}", label, cache_path, e);
                                return Err(format!("Write error: {}", e));
                            }
                        },
                        Err(e) => return Err(format!("Text decode error: {}", e)),
                    }
                } else {
                    log::warn!("Failed to download {}: Status {}", label, resp.status());
                    return Err(format!("HTTP Error: {}", resp.status()));
                }
            },
            Err(e) => return Err(format!("Network error: {}", e)),
        }
    } else {
        log::debug!("Using cached {}: {:?}", label, cache_path);
    }

    fs::read_to_string(cache_path)
        .await
        .map_err(|e| format!("Read error: {}", e))
}

// --- ID Resolution ---

fn resolve_technical_url(id: &str) -> Option<&'static str> {
    match id {
        // Science & Medical
        "medical-terms" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/medicalterms/dict/medicalterms-en.txt",
        ),
        "scientific-terms-us" => Some(
            "https://raw.githubusercontent.com/streetsidesoftware/cspell-dicts/main/dictionaries/scientific_terms_US/src/custom_scientific_US.dic.txt",
        ),

        // Technical / Software
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

fn resolve_language_urls(dict_code: &str) -> Option<(&'static str, &'static str)> {
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

fn list_technical_ids() -> Vec<String> {
    vec![
        "software-terms".to_string(),
        "companies".to_string(),
        "fullstack".to_string(),
        "filetypes".to_string(),
    ]
}

fn list_scientific_ids() -> Vec<String> {
    vec![
        "medical-terms".to_string(),
        "scientific-terms-us".to_string(),
    ]
}

// --- Loaders ---

async fn load_language_dictionary(
    client: reqwest::Client,
    cache_dir: PathBuf,
    dict_code: String,
) -> Result<(String, String), String> {
    let aff_path = cache_dir.join(format!("{}.aff", dict_code));
    let dic_path = cache_dir.join(format!("{}.dic", dict_code));

    let (aff_url, dic_url) = if let Some((aff, dic)) = resolve_language_urls(&dict_code) {
        (aff.to_string(), dic.to_string())
    } else {
        // Fallback to wooorm for generic languages
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

    let aff_label = format!("{}.aff", dict_code);
    let dic_label = format!("{}.dic", dict_code);

    // Parallel download
    let (aff_res, dic_res) = tokio::join!(
        ensure_file_downloaded(&client, &aff_url, &aff_path, &aff_label),
        ensure_file_downloaded(&client, &dic_url, &dic_path, &dic_label)
    );

    if let (Ok(aff), Ok(dic)) = (aff_res, dic_res) {
        Ok((aff, dic))
    } else {
        Err(format!("Failed to load language dictionary: {}", dict_code))
    }
}

async fn load_technical_dictionary(
    client: reqwest::Client,
    cache_dir: PathBuf,
    id: String,
) -> Result<String, String> {
    let url = resolve_technical_url(&id).ok_or_else(|| format!("Unknown technical ID: {}", id))?;
    let cache_path = cache_dir.join(format!("{}.txt", id));

    ensure_file_downloaded(&client, url, &cache_path, &id).await
}

// --- Commands ---

#[tauri::command]
pub async fn add_to_dictionary(app_handle: tauri::AppHandle, word: String) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let dict_path = app_dir.join("custom-spelling.dic");

    if !app_dir.exists() {
        let _ = fs::create_dir_all(&app_dir).await;
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
            .map_err(|e| format!("Failed to open dictionary: {}", e))?;

        let line = format!("{}\n", word);
        if let Err(e) = file.write_all(line.as_bytes()).await {
            return Err(format!("Failed to write word: {}", e));
        }
    }

    let state = app_handle.state::<AppState>();
    let mut custom_dict = state.custom_dict.lock().await;
    custom_dict.insert(word.to_lowercase());

    Ok(())
}

#[tauri::command]
pub async fn load_user_dictionary(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let dict_path = app_dir.join("custom-spelling.dic");

    if !dict_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&dict_path)
        .await
        .map_err(|e| format!("Failed to read custom dictionary: {}", e))?;

    Ok(content
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect())
}

#[tauri::command]
pub async fn init_spellchecker(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    dictionaries: Option<Vec<String>>,
    technical_dictionaries: Option<bool>,
    science_dictionaries: Option<bool>,
) -> Result<(), String> {
    use crate::state::SpellcheckStatus;
    // Check if already initializing or ready
    {
        let status = state.spellcheck_status.lock().await;
        if *status == SpellcheckStatus::Loading || *status == SpellcheckStatus::Ready {
            log::info!("[SPELLCHECK-RUST] Spellchecker already initializing or ready");
            return Ok(());
        }
    }

    // Mark as loading
    {
        let mut status = state.spellcheck_status.lock().await;
        *status = SpellcheckStatus::Loading;
    }

    let dict_codes = dictionaries.unwrap_or_else(|| vec!["en".to_string()]);
    let enable_technical = technical_dictionaries.unwrap_or(true);
    let enable_science = science_dictionaries.unwrap_or(false);

    log::info!(
        "Starting spellchecker initialization. Langs: {:?}, Tech: {}, Sci: {}",
        dict_codes,
        enable_technical,
        enable_science
    );

    // Clone necessary data for the background task
    let local_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_handle_clone = app_handle.clone();

    // Spawn initialization in background to avoid blocking
    tauri::async_runtime::spawn(async move {
        let cache_dir = local_dir.join("spellcheck_cache");
        let tech_cache_dir = cache_dir.join("technical");
        let custom_path = app_dir.join("custom-spelling.dic");

        let _ = fs::create_dir_all(&cache_dir).await;

        let mut spec_codes = Vec::new();
        if enable_technical {
            spec_codes.extend(list_technical_ids());
        }
        if enable_science {
            spec_codes.extend(list_scientific_ids());
        }

        if !spec_codes.is_empty() {
            let _ = fs::create_dir_all(&tech_cache_dir).await;
        }

        let client = reqwest::Client::builder()
            .connect_timeout(SPELL_CHECK_TIMEOUT_CONNECT)
            .timeout(SPELL_CHECK_TIMEOUT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        // Spawn download tasks
        let mut dict_tasks = Vec::new();
        for (i, code) in dict_codes.into_iter().enumerate() {
            let c = client.clone();
            let d = cache_dir.clone();
            dict_tasks.push(tokio::spawn(async move {
                (i, load_language_dictionary(c, d, code).await)
            }));
        }

        let mut spec_tasks = Vec::new();
        for code in spec_codes {
            let c = client.clone();
            let d = tech_cache_dir.clone();
            spec_tasks.push(tokio::spawn(async move {
                (code.clone(), load_technical_dictionary(c, d, code).await)
            }));
        }

        // Process Language Dictionaries
        let mut combined_aff = String::new();
        let mut unique_words = HashSet::new();

        // Sort to ensure primary dictionary preference for AFF
        let mut dict_results = Vec::new();
        for task in dict_tasks {
            if let Ok((i, res)) = task.await {
                dict_results.push((i, res));
            }
        }
        dict_results.sort_by_key(|k| k.0);

        for (_, res) in dict_results {
            match res {
                Ok((aff, dic)) => {
                    if combined_aff.is_empty() {
                        combined_aff = aff.trim_start_matches('\u{feff}').to_string();
                    }
                    for line in dic.trim_start_matches('\u{feff}').lines() {
                        let t = line.trim();
                        if !t.is_empty() && !t.chars().all(char::is_numeric) {
                            unique_words.insert(t.to_string());
                        }
                    }
                },
                Err(e) => log::warn!("{}", e),
            }
        }

        // Process Technical Dictionaries
        for task in spec_tasks {
            if let Ok((code, res)) = task.await {
                match res {
                    Ok(content) => {
                        let mut count = 0;
                        for line in content.lines() {
                            let t = line.trim();
                            if !t.is_empty() && !t.starts_with('#') && !t.starts_with("//") {
                                unique_words.insert(t.to_string());
                                count += 1;
                            }
                        }
                        log::info!("Loaded {}: {} words", code, count);
                    },
                    Err(e) => log::warn!("Failed to load {}: {}", code, e),
                }
            }
        }

        let total_word_count = unique_words.len();
        let state = app_handle_clone.state::<AppState>();

        if !combined_aff.is_empty() && total_word_count > 0 {
            let mut sorted_words: Vec<_> = unique_words.into_iter().collect();
            sorted_words.sort_unstable();

            let mut combined_dic = String::with_capacity(total_word_count * 9 + 64);
            combined_dic.push_str(&total_word_count.to_string());
            combined_dic.push('\n');
            for word in sorted_words {
                combined_dic.push_str(&word);
                combined_dic.push('\n');
            }

            match Dictionary::new(&combined_aff, &combined_dic) {
                Ok(dict) => {
                    let mut speller = state.speller.lock().await;
                    *speller = Some(dict);
                    let mut status = state.spellcheck_status.lock().await;
                    *status = SpellcheckStatus::Ready;
                    log::info!("Spellchecker ready: {} unique words", total_word_count);
                },
                Err(e) => {
                    log::error!("Failed to create dictionary: {:?}", e);
                    let mut status = state.spellcheck_status.lock().await;
                    *status = SpellcheckStatus::Failed;
                },
            }
        } else {
            log::warn!("No dictionary content available");
            let mut status = state.spellcheck_status.lock().await;
            *status = SpellcheckStatus::Failed;
        }

        // Load custom user dictionary into State (for ignore logic)
        if let Ok(text) = fs::read_to_string(&custom_path).await {
            let mut custom = state.custom_dict.lock().await;
            for line in text.lines() {
                let w = line.trim();
                if !w.is_empty() {
                    custom.insert(w.to_lowercase());
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn check_words(
    state: State<'_, AppState>,
    words: Vec<String>,
) -> Result<Vec<String>, String> {
    log::debug!("check_words called with {} words", words.len());

    let mut misspelled = Vec::new();

    // Chunking to prevent blocking the async runtime too long
    for chunk in words.chunks(SPELL_CHECK_CHUNK_SIZE) {
        // Clone necessary data from mutex guards, then release locks immediately
        let (speller_opt, custom_dict) = {
            let speller_guard = state.speller.lock().await;
            let custom_guard = state.custom_dict.lock().await;
            (speller_guard.clone(), custom_guard.clone())
        };

        if speller_opt.is_none() {
            log::warn!("Speller is None in check_words!");
        }

        if let Some(speller) = speller_opt {
            for word in chunk {
                let clean = word.trim();
                if clean.is_empty() {
                    continue;
                }

                let lower = clean.to_lowercase();
                if custom_dict.contains(&lower) {
                    continue;
                }

                // Handle possessives ('s and s')
                if lower
                    .strip_suffix("'s")
                    .is_some_and(|b| custom_dict.contains(b))
                    || lower
                        .strip_suffix('\'')
                        .is_some_and(|b| custom_dict.contains(b))
                {
                    continue;
                }

                if !speller.check(clean) {
                    misspelled.push(word.to_string());
                }
            }
        }
        // Yield to allow other tasks to run
        tokio::task::yield_now().await;
    }

    log::debug!(
        "check_words returning {} misspelled words",
        misspelled.len()
    );
    if !misspelled.is_empty() {
        log::debug!(
            "Sample misspelled: {:?}",
            &misspelled[..misspelled.len().min(5)]
        );
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
    Ok(suggestions.into_iter().take(MAX_SUGGESTIONS).collect())
}

#[tauri::command]
pub async fn get_spellcheck_status(state: State<'_, AppState>) -> Result<String, String> {
    use crate::state::SpellcheckStatus;
    let status = state.spellcheck_status.lock().await;
    let status_str = match *status {
        SpellcheckStatus::Uninitialized => "uninitialized",
        SpellcheckStatus::Loading => "loading",
        SpellcheckStatus::Ready => "ready",
        SpellcheckStatus::Failed => "failed",
    };
    Ok(status_str.to_string())
}
