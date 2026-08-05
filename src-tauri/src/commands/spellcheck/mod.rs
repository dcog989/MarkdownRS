pub mod dicts;
pub mod download;
pub mod init;
pub mod user_dict;

use crate::state::AppState;
use crate::state::SpellcheckStatus;
use crate::utils::{IntoTauriError, MutexExt, RwLockExt, handle_error};
use std::sync::Arc;
use tauri::State;

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

            if lower
                .strip_suffix("'s")
                .is_some_and(|b| custom_snapshot.contains(b))
                || lower
                    .strip_suffix('\'')
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

    let suggestions = tokio::task::spawn_blocking(move || {
        let guard = speller.lock_or_recover();
        let dictionaries = match guard.as_ref() {
            Some(d) => d,
            None => return Vec::new(),
        };

        let mut seen = Vec::new();
        for dictionary in dictionaries {
            let mut suggestions = Vec::new();
            dictionary.suggest(&word, &mut suggestions);
            for suggestion in suggestions {
                if !seen.contains(&suggestion) {
                    seen.push(suggestion);
                }
            }
        }
        seen.into_iter().take(MAX_SUGGESTIONS).collect()
    })
    .await
    .map_err(|e| handle_error(None, "get spelling suggestions", e))?;

    Ok(suggestions)
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
