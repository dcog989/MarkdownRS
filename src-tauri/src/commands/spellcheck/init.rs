use crate::state::AppState;
use crate::state::SpellcheckStatus;
use crate::utils::MutexExt;
use spellbook::Dictionary;
use std::collections::HashSet;
use std::time::Duration;
use tauri::Manager;

const SPELL_CHECK_TIMEOUT_CONNECT: Duration = Duration::from_secs(2);
const SPELL_CHECK_TIMEOUT: Duration = Duration::from_secs(5);

#[tauri::command]
pub async fn init_spellchecker(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
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

        if let Err(e) = tokio::fs::create_dir_all(&cache_dir).await {
            log::warn!("Failed to create spellcheck cache directory: {}", e);
        }

        let mut spec_codes = Vec::new();
        if enable_technical {
            spec_codes.extend(super::dicts::list_technical_ids());
        }
        if enable_science {
            spec_codes.extend(super::dicts::list_scientific_ids());
        }

        if !spec_codes.is_empty()
            && let Err(e) = tokio::fs::create_dir_all(&tech_cache_dir).await
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
                (
                    i,
                    super::download::load_language_dictionary(c, d, code).await,
                )
            }));
        }

        let mut spec_tasks = Vec::new();
        for code in spec_codes {
            let c = client.clone();
            let d = tech_cache_dir.clone();
            spec_tasks.push(tokio::spawn(async move {
                (
                    code.clone(),
                    super::download::load_technical_dictionary(c, d, code).await,
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

        if let Ok(text) = tokio::fs::read_to_string(&custom_path).await {
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
