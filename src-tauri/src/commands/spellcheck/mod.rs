pub mod dicts;
pub mod download;
pub mod init;
pub mod user_dict;

use crate::state::AppState;
use crate::state::SpellcheckStatus;
use crate::utils::{IntoTauriError, MutexExt, RwLockExt, handle_error};
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::{Emitter, State};

const MAX_SUGGESTIONS: usize = 5;

#[tauri::command]
pub async fn add_to_dictionary(app_handle: tauri::AppHandle, word: String) -> Result<(), String> {
    user_dict::add_to_dictionary_inner(app_handle, word)
        .await
        .to_tauri_result()
}

#[tauri::command]
pub async fn add_words_to_dictionary(
    app_handle: tauri::AppHandle,
    words: Vec<String>,
) -> Result<(), String> {
    user_dict::add_words_to_dictionary_inner(app_handle, words)
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
pub async fn check_words(
    state: State<'_, AppState>,
    words: Vec<String>,
) -> Result<Vec<String>, String> {
    log::debug!("check_words called with {} words", words.len());

    let custom_snapshot = {
        let guard = state.custom_dict.read_or_recover();
        Arc::clone(&guard)
    };

    let speller = state.speller.clone();

    let misspelled = tokio::task::spawn_blocking(move || {
        let guard = speller.lock_or_recover();
        let dictionaries = match guard.as_ref() {
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

            // The frontend strips possessive suffixes before calling, so this
            // only guards against a possessive word arriving directly.
            if lower
                .strip_suffix("'s")
                .is_some_and(|b| custom_snapshot.contains(b))
            {
                continue;
            }

            let correct_in_any = dictionaries.iter().any(|dict| dict.check(clean));
            if !correct_in_any {
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
    let speller = state.speller.clone();

    let custom_snapshot = {
        let guard = state.custom_dict.read_or_recover();
        Arc::clone(&guard)
    };

    let suggestions = tokio::task::spawn_blocking(move || {
        let guard = speller.lock_or_recover();
        let dictionaries = match guard.as_ref() {
            Some(d) => d,
            None => return Vec::new(),
        };

        let mut seen = HashSet::new();
        let mut ordered = Vec::new();
        for dictionary in dictionaries {
            let mut suggestions = Vec::new();
            dictionary.suggest(&word, &mut suggestions);
            for suggestion in suggestions {
                if custom_snapshot.contains(&suggestion.to_lowercase()) {
                    continue;
                }
                if seen.insert(suggestion.clone()) {
                    ordered.push(suggestion);
                }
            }
            if ordered.len() >= MAX_SUGGESTIONS {
                break;
            }
        }
        ordered.into_iter().take(MAX_SUGGESTIONS).collect()
    })
    .await
    .map_err(|e| handle_error(None, "get spelling suggestions", e))?;

    Ok(suggestions)
}

#[tauri::command]
pub async fn get_spellcheck_status(state: State<'_, AppState>) -> Result<SpellcheckStatus, String> {
    let status = state.spellcheck_status.lock_or_recover();
    Ok(*status)
}

#[tauri::command]
pub async fn cancel_spellcheck_init(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let cancelled = state.spellcheck_cancel.swap(true, Ordering::SeqCst);
    if !cancelled {
        log::info!("[SPELLCHECK-RUST] Spellcheck init cancellation requested");
    }

    // Invalidate any in-flight build so it discards its result.
    state.spellcheck_init_gen.fetch_add(1, Ordering::SeqCst);

    {
        let mut status = state.spellcheck_status.lock_or_recover();
        *status = SpellcheckStatus::Uninitialized;
    }
    {
        let mut loaded = state.loaded_spellcheck_config.lock_or_recover();
        *loaded = None;
    }
    // Let a frontend waiting on init completion resolve promptly.
    let _ = app_handle.emit(init::SPELLCHECK_STATUS_EVENT, "failed");
    Ok(())
}
