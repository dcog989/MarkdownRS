pub mod dicts;
pub mod download;
pub mod user_dict;

use crate::state::AppState;
use crate::state::SpellcheckStatus;
use crate::utils::{IntoTauriError, MutexExt, handle_error};
use spellbook::Dictionary;
use std::collections::HashSet;
use std::time::Duration;
use tauri::{Manager, State};
use tokio::fs;

const SPELL_CHECK_TIMEOUT_CONNECT: Duration = Duration::from_secs(2);
const SPELL_CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_SUGGESTIONS: usize = 5;

#[tauri::command]
pub async fn add_to_dictionary(app_handle: tauri::AppHandle, word: String) -> Result<(), String> {
    user_dict::add_to_dictionary_inner(app_handle, word)
        .await
        .to_tauri_result()
}

#[tauri::command]
pub async fn load_user_dictionary(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    user_dict::load_user_dictionary_inner(app_handle)
        .await
        .to_tauri_result()
}

#[tauri::command]
pub async fn init_spellchecker(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    dictionaries: Option<Vec<String>>,
    technical_dictionaries: Option<bool>,
    science_dictionaries: Option<bool>,
) -> Result<(), String> {
    {
        let mut status = state.spellcheck_status.lock_or_recover();
        if *status == SpellcheckStatus::Loading || *status == SpellcheckStatus::Ready {
            log::info!("[SPELLCHECK-RUST] Spellchecker already initializing or ready");
            return Ok(());
        }
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

    let local_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    let app_handle_clone = app_handle.clone();

    let handle = tauri::async_runtime::spawn(async move {
        let cache_dir = local_dir.join("spellcheck_cache");
        let tech_cache_dir = cache_dir.join("technical");
        let custom_path = config_dir.join("custom-spelling.dic");

        if let Err(e) = fs::create_dir_all(&cache_dir).await {
            log::warn!("Failed to create spellcheck cache directory: {}", e);
        }

        let mut spec_codes = Vec::new();
        if enable_technical {
            spec_codes.extend(dicts::list_technical_ids());
        }
        if enable_science {
            spec_codes.extend(dicts::list_scientific_ids());
        }

        if !spec_codes.is_empty()
            && let Err(e) = fs::create_dir_all(&tech_cache_dir).await
        {
            log::warn!(
                "Failed to create technical dictionary cache directory: {}",
                e
            );
        }

        let client = reqwest::Client::builder()
            .connect_timeout(SPELL_CHECK_TIMEOUT_CONNECT)
            .timeout(SPELL_CHECK_TIMEOUT)
            .build()
            .unwrap_or_else(|e| {
                log::warn!("Failed to build HTTP client with timeouts: {}", e);
                reqwest::Client::builder()
                    .connect_timeout(SPELL_CHECK_TIMEOUT_CONNECT)
                    .timeout(SPELL_CHECK_TIMEOUT)
                    .build()
                    .expect("Failed to build HTTP client after TLS init failure")
            });

        let mut dict_tasks = Vec::new();
        for (i, code) in dict_codes.into_iter().enumerate() {
            let c = client.clone();
            let d = cache_dir.clone();
            dict_tasks.push(tokio::spawn(async move {
                (i, download::load_language_dictionary(c, d, code).await)
            }));
        }

        let mut spec_tasks = Vec::new();
        for code in spec_codes {
            let c = client.clone();
            let d = tech_cache_dir.clone();
            spec_tasks.push(tokio::spawn(async move {
                (
                    code.clone(),
                    download::load_technical_dictionary(c, d, code).await,
                )
            }));
        }

        let mut combined_aff = String::new();
        let mut unique_words = HashSet::new();

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

            let dict_result =
                tokio::task::spawn_blocking(move || Dictionary::new(&combined_aff, &combined_dic))
                    .await;

            match dict_result {
                Ok(Ok(dict)) => {
                    let mut speller = state.speller.lock_or_recover();
                    *speller = Some(dict);
                    let mut status = state.spellcheck_status.lock_or_recover();
                    *status = SpellcheckStatus::Ready;
                    log::info!("Spellchecker ready: {} unique words", total_word_count);
                },
                Ok(Err(e)) => {
                    log::error!("Failed to create dictionary: {:?}", e);
                    let mut status = state.spellcheck_status.lock_or_recover();
                    *status = SpellcheckStatus::Failed;
                },
                Err(e) => {
                    log::error!("Dictionary construction task panicked: {:?}", e);
                    let mut status = state.spellcheck_status.lock_or_recover();
                    *status = SpellcheckStatus::Failed;
                },
            }
        } else {
            log::warn!("No dictionary content available");
            let mut status = state.spellcheck_status.lock_or_recover();
            *status = SpellcheckStatus::Failed;
        }

        if let Ok(text) = fs::read_to_string(&custom_path).await {
            let mut custom = state.custom_dict.lock_or_recover();
            for line in text.lines() {
                let w = line.trim();
                if !w.is_empty() {
                    custom.insert(w.to_lowercase());
                }
            }
        }
    });

    let app_handle_recovery = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = handle.await {
            log::error!("Spellchecker init task panicked: {:?}", e);
            let state = app_handle_recovery.state::<AppState>();
            let mut status = state.spellcheck_status.lock_or_recover();
            if *status == SpellcheckStatus::Loading {
                *status = SpellcheckStatus::Failed;
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

    let custom_snapshot = {
        let guard = state.custom_dict.lock_or_recover();
        guard.clone()
    };

    let speller = state.speller.clone();

    let misspelled = tokio::task::spawn_blocking(move || {
        let guard = speller.lock_or_recover();
        let dict = match guard.as_ref() {
            Some(d) => d,
            None => return Vec::new(),
        };

        let mut result = Vec::new();
        for word in &words {
            let clean = word.trim();
            if clean.is_empty() {
                continue;
            }

            let lower = clean.to_lowercase();
            if custom_snapshot.contains(&lower) {
                continue;
            }

            if lower
                .strip_suffix("'s")
                .is_some_and(|b| custom_snapshot.contains(b))
                || lower
                    .strip_suffix('\'')
                    .is_some_and(|b| custom_snapshot.contains(b))
            {
                continue;
            }

            if !dict.check(clean) {
                result.push(word.to_string());
            }
        }
        result
    })
    .await
    .map_err(|e| handle_error(None, "check spelling", e))?;

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
    let speller_guard = state.speller.lock_or_recover();

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
    let status = state.spellcheck_status.lock_or_recover();
    let status_str = match *status {
        SpellcheckStatus::Uninitialized => "uninitialized",
        SpellcheckStatus::Loading => "loading",
        SpellcheckStatus::Ready => "ready",
        SpellcheckStatus::Failed => "failed",
    };
    Ok(status_str.to_string())
}
