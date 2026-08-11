use crate::state::{AppState, SpellcheckConfig, SpellcheckStatus};
use crate::utils;
use crate::utils::{MutexExt, RwLockExt};
use spellbook::Dictionary;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Emitter, Manager};

/// Name of the event emitted when spellcheck initialization reaches a
/// terminal state. Payload is the status string: "ready" or "failed".
const SPELLCHECK_STATUS_EVENT: &str = "spellcheck-status";

fn set_spellcheck_status(app_handle: &tauri::AppHandle, status: SpellcheckStatus) {
    let state = app_handle.state::<AppState>();
    let mut guard = state.spellcheck_status.lock_or_recover();
    *guard = status;
    drop(guard);

    let status_str = match status {
        SpellcheckStatus::Ready => "ready",
        SpellcheckStatus::Failed => "failed",
        SpellcheckStatus::Loading | SpellcheckStatus::Uninitialized => return,
    };
    let _ = app_handle.emit(SPELLCHECK_STATUS_EVENT, status_str);
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
        && let Some((combined_dic, _)) =
            super::download::build_combined_dic_string(&technical_words)
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
    let custom_path = utils::custom_dict_path(&config_dir);

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

    let client = super::download::build_http_client();
    let (language_dicts, technical_words) = super::download::download_and_collect_words(
        &client,
        dict_codes,
        &cache_dir,
        &spec_codes,
        &tech_cache_dir,
    )
    .await;

    let state = app_handle.state::<AppState>();
    let supplemental_count = technical_words.len();

    if language_dicts.is_empty() {
        log::warn!(
            "No language dictionaries were loaded; spellchecker disabled ({} supplemental words skipped)",
            supplemental_count
        );
        set_spellcheck_status(&app_handle, SpellcheckStatus::Failed);
        return;
    }

    let dictionaries_result = tokio::task::spawn_blocking(move || {
        build_spellbook_dictionaries(language_dicts, technical_words)
    })
    .await;

    match dictionaries_result {
        Ok(dictionaries) if !dictionaries.is_empty() => {
            let dict_count = dictionaries.len();
            let mut speller = state.speller.lock_or_recover();
            *speller = Some(dictionaries);
            log::info!(
                "Spellchecker ready: {} dictionaries, {} supplemental words",
                dict_count,
                supplemental_count
            );
            set_spellcheck_status(&app_handle, SpellcheckStatus::Ready);
        },
        Ok(_) => {
            log::warn!("No dictionary content available");
            set_spellcheck_status(&app_handle, SpellcheckStatus::Failed);
        },
        Err(e) => {
            log::error!("Dictionary construction task panicked: {:?}", e);
            set_spellcheck_status(&app_handle, SpellcheckStatus::Failed);
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
    let dict_codes = dictionaries.unwrap_or_else(|| vec!["en".to_string()]);
    let enable_technical = technical_dictionaries.unwrap_or(true);
    let enable_science = science_dictionaries.unwrap_or(false);

    {
        let mut status = state.spellcheck_status.lock_or_recover();
        let mut loaded = state.loaded_spellcheck_config.lock_or_recover();
        let requested = SpellcheckConfig::new(&dict_codes, enable_technical, enable_science);

        if *status == SpellcheckStatus::Loading {
            log::info!("[SPELLCHECK-RUST] Spellchecker already initializing");
            return Ok(());
        }

        if *status == SpellcheckStatus::Ready && loaded.as_ref() == Some(&requested) {
            log::info!("[SPELLCHECK-RUST] Spellchecker already ready for requested dictionaries");
            return Ok(());
        }

        *loaded = Some(requested);
        *status = SpellcheckStatus::Loading;
    }

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
    let config_dir = utils::app_config_dir(&app_handle).map_err(|e| e.to_string())?;

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
            let was_loading = {
                let status = state.spellcheck_status.lock_or_recover();
                *status == SpellcheckStatus::Loading
            };
            if was_loading {
                set_spellcheck_status(&app_handle, SpellcheckStatus::Failed);
            }
        }
    });

    Ok(())
}
