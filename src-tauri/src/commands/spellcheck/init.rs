use crate::state::AppState;
use crate::state::SpellcheckStatus;
use crate::utils::{MutexExt, RwLockExt};
use spellbook::Dictionary;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;

const SPELL_CHECK_TIMEOUT_CONNECT: Duration = Duration::from_secs(2);
const SPELL_CHECK_TIMEOUT: Duration = Duration::from_secs(5);

fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(SPELL_CHECK_TIMEOUT_CONNECT)
        .timeout(SPELL_CHECK_TIMEOUT)
        .build()
        .expect("Failed to build HTTP client")
}

async fn download_and_collect_words(
    client: &reqwest::Client,
    dict_codes: Vec<String>,
    cache_dir: &Path,
    spec_codes: &[String],
    tech_cache_dir: &Path,
) -> (Vec<(String, String)>, HashSet<String>) {
    let mut dict_tasks = Vec::new();
    for (i, code) in dict_codes.into_iter().enumerate() {
        let c = client.clone();
        let d = cache_dir.to_path_buf();
        dict_tasks.push(tokio::spawn(async move {
            (
                i,
                super::download::load_language_dictionary(c, d, code).await,
            )
        }));
    }

    let mut spec_tasks = Vec::new();
    for code in spec_codes.iter() {
        let c = client.clone();
        let d = tech_cache_dir.to_path_buf();
        let code = code.clone();
        spec_tasks.push(tokio::spawn(async move {
            (
                code.clone(),
                super::download::load_technical_dictionary(c, d, code).await,
            )
        }));
    }

    let mut language_dicts: Vec<(String, String)> = Vec::new();
    let mut technical_words = HashSet::new();

    let mut dict_results: Vec<(usize, _)> = Vec::new();
    for task in dict_tasks {
        if let Ok((i, res)) = task.await {
            dict_results.push((i, res));
        }
    }
    dict_results.sort_by_key(|k| k.0);

    for (_, res) in dict_results {
        match res {
            Ok((aff, dic)) => {
                language_dicts.push((
                    aff.trim_start_matches('\u{feff}').to_string(),
                    dic.trim_start_matches('\u{feff}').to_string(),
                ));
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
                            technical_words.insert(t.to_string());
                            count += 1;
                        }
                    }
                    log::info!("Loaded {}: {} words", code, count);
                },
                Err(e) => log::warn!("Failed to load {}: {}", code, e),
            }
        }
    }

    (language_dicts, technical_words)
}

fn build_combined_dic_string(words: &HashSet<String>) -> Option<(String, usize)> {
    if words.is_empty() {
        return None;
    }
    let mut sorted: Vec<_> = words.iter().cloned().collect();
    sorted.sort_unstable();
    let total = sorted.len();

    let mut combined_dic = String::with_capacity(total * 9 + 64);
    combined_dic.push_str(&total.to_string());
    combined_dic.push('\n');
    for word in &sorted {
        combined_dic.push_str(word);
        combined_dic.push('\n');
    }

    Some((combined_dic, total))
}

/// Build one `Dictionary` per language (each keeps its own affix rules)
/// plus a single supplemental word-only dictionary for technical terms.
fn build_spellbook_dictionaries(
    language_dicts: Vec<(String, String)>,
    technical_words: HashSet<String>,
) -> Vec<Dictionary> {
    let mut dictionaries = Vec::new();

    for (aff, dic) in &language_dicts {
        match Dictionary::new(aff, dic) {
            Ok(dict) => dictionaries.push(dict),
            Err(e) => log::error!("Failed to build language dictionary: {:?}", e),
        }
    }

    if !technical_words.is_empty()
        && let Some((combined_dic, _)) = build_combined_dic_string(&technical_words)
        && let Ok(dict) = Dictionary::new("", &combined_dic)
    {
        dictionaries.push(dict);
    }

    dictionaries
}

async fn load_custom_dictionary(store: &AppState, custom_path: &Path) {
    if let Ok(text) = tokio::fs::read_to_string(custom_path).await {
        let mut custom = store.custom_dict.write_or_recover();
        let set = Arc::make_mut(&mut custom);
        for line in text.lines() {
            let w = line.trim();
            if !w.is_empty() {
                set.insert(w.to_lowercase());
            }
        }
    }
}

async fn run_spellcheck_init(
    app_handle: tauri::AppHandle,
    dict_codes: Vec<String>,
    enable_technical: bool,
    enable_science: bool,
    local_dir: PathBuf,
    config_dir: PathBuf,
) {
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

    let client = build_http_client();
    let (language_dicts, technical_words) = download_and_collect_words(
        &client,
        dict_codes,
        &cache_dir,
        &spec_codes,
        &tech_cache_dir,
    )
    .await;

    let state = app_handle.state::<AppState>();
    let supplemental_count = technical_words.len();

    let dictionaries_result = tokio::task::spawn_blocking(move || {
        build_spellbook_dictionaries(language_dicts, technical_words)
    })
    .await;

    match dictionaries_result {
        Ok(dictionaries) if !dictionaries.is_empty() => {
            let dict_count = dictionaries.len();
            let mut speller = state.speller.lock_or_recover();
            *speller = Some(dictionaries);
            let mut status = state.spellcheck_status.lock_or_recover();
            *status = SpellcheckStatus::Ready;
            log::info!(
                "Spellchecker ready: {} dictionaries, {} supplemental words",
                dict_count,
                supplemental_count
            );
        },
        Ok(_) => {
            log::warn!("No dictionary content available");
            let mut status = state.spellcheck_status.lock_or_recover();
            *status = SpellcheckStatus::Failed;
        },
        Err(e) => {
            log::error!("Dictionary construction task panicked: {:?}", e);
            let mut status = state.spellcheck_status.lock_or_recover();
            *status = SpellcheckStatus::Failed;
        },
    }

    load_custom_dictionary(&state, &custom_path).await;
}

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

    let handle = tauri::async_runtime::spawn(run_spellcheck_init(
        app_handle.clone(),
        dict_codes,
        enable_technical,
        enable_science,
        local_dir,
        config_dir,
    ));

    tauri::async_runtime::spawn(async move {
        if let Err(e) = handle.await {
            log::error!("Spellchecker init task panicked: {:?}", e);
            let state = app_handle.state::<AppState>();
            let mut status = state.spellcheck_status.lock_or_recover();
            if *status == SpellcheckStatus::Loading {
                *status = SpellcheckStatus::Failed;
            }
        }
    });

    Ok(())
}
