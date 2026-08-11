use super::dicts;
use anyhow::{Result, anyhow};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::Duration;
use tokio::fs;

const SPELL_CHECK_TIMEOUT_CONNECT: Duration = Duration::from_secs(2);
const SPELL_CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const SPELL_CHECK_MAX_ATTEMPTS: u32 = 2;

/// Bump to invalidate the on-disk dictionary cache (e.g. when a source URL or
/// upstream wordlist changes); older files are ignored by the versioned name.
const DICT_CACHE_VERSION: &str = "v1";

async fn read_cache_or_delete(path: &PathBuf, label: &str) -> Result<String> {
    match fs::read_to_string(path).await {
        Ok(content) => Ok(content),
        Err(e) => {
            log::warn!(
                "Failed to read cached {}: {:?}, deleting corrupted cache",
                label,
                path
            );
            let _ = fs::remove_file(path).await;
            Err(anyhow!("Read error: {}", e))
        },
    }
}

async fn download_once(
    client: &reqwest::Client,
    url: &str,
    cache_path: &PathBuf,
    label: &str,
) -> Result<String> {
    log::info!("Downloading {}: {}", label, url);
    let resp = client
        .get(url)
        .timeout(SPELL_CHECK_TIMEOUT)
        .send()
        .await
        .map_err(|e| anyhow!("Network error downloading {}: {}", label, e))?;

    if !resp.status().is_success() {
        return Err(anyhow!(
            "HTTP Error downloading {}: Status {}",
            label,
            resp.status()
        ));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| anyhow!("Failed to decode {}: {}", label, e))?;

    if let Err(e) = crate::utils::atomic_write(cache_path, text.as_bytes()).await {
        log::error!("Failed to save {} to {:?}: {}", label, cache_path, e);
        let _ = fs::remove_file(cache_path).await;
        return Err(anyhow!("Write error: {}", e));
    }

    read_cache_or_delete(cache_path, label).await
}

async fn ensure_file_downloaded(
    client: &reqwest::Client,
    url: &str,
    cache_path: &PathBuf,
    label: &str,
) -> Result<String> {
    if cache_path.exists() {
        log::debug!("Using cached {}: {:?}", label, cache_path);
        return read_cache_or_delete(cache_path, label).await;
    }

    let mut last_error = None;
    for attempt in 1..=SPELL_CHECK_MAX_ATTEMPTS {
        match download_once(client, url, cache_path, label).await {
            Ok(content) => return Ok(content),
            Err(e) => {
                log::warn!(
                    "Download attempt {}/{} for {} failed: {:#}",
                    attempt,
                    SPELL_CHECK_MAX_ATTEMPTS,
                    label,
                    e
                );
                last_error = Some(e);
            },
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow!("Download failed: {}", label)))
}

pub async fn load_language_dictionary(
    client: reqwest::Client,
    cache_dir: PathBuf,
    dict_code: String,
) -> Result<(String, String)> {
    let aff_path = cache_dir.join(format!("{}.{}.aff", dict_code, DICT_CACHE_VERSION));
    let dic_path = cache_dir.join(format!("{}.{}.dic", dict_code, DICT_CACHE_VERSION));

    let (aff_url, dic_url) = if let Some((aff, dic)) = dicts::resolve_language_urls(&dict_code) {
        (aff.to_string(), dic.to_string())
    } else {
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

    let (aff_res, dic_res) = tokio::join!(
        ensure_file_downloaded(&client, &aff_url, &aff_path, &aff_label),
        ensure_file_downloaded(&client, &dic_url, &dic_path, &dic_label)
    );

    if let (Ok(aff), Ok(dic)) = (aff_res, dic_res) {
        Ok((aff, dic))
    } else {
        Err(anyhow!("Failed to load language dictionary: {}", dict_code))
    }
}

pub async fn load_technical_dictionary(
    client: reqwest::Client,
    cache_dir: PathBuf,
    id: String,
) -> Result<String> {
    let url =
        dicts::resolve_technical_url(&id).ok_or_else(|| anyhow!("Unknown technical ID: {}", id))?;
    let cache_path = cache_dir.join(format!("{}.{}.txt", id, DICT_CACHE_VERSION));

    ensure_file_downloaded(&client, url, &cache_path, &id).await
}

pub fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(SPELL_CHECK_TIMEOUT_CONNECT)
        .timeout(SPELL_CHECK_TIMEOUT)
        .build()
        .expect("Failed to build HTTP client")
}

pub async fn download_and_collect_words(
    client: &reqwest::Client,
    dict_codes: Vec<String>,
    cache_dir: &Path,
    spec_codes: &[String],
    tech_cache_dir: &Path,
    cancel: &std::sync::atomic::AtomicBool,
    progress: &mut dyn FnMut(usize, usize),
) -> (Vec<(String, String)>, HashSet<String>) {
    let total = dict_codes.len() + spec_codes.len();
    let mut done = 0;

    let mut dict_tasks = Vec::new();
    for (i, code) in dict_codes.into_iter().enumerate() {
        let c = client.clone();
        let d = cache_dir.to_path_buf();
        dict_tasks.push(tokio::spawn(async move {
            (i, load_language_dictionary(c, d, code).await)
        }));
    }

    let mut spec_tasks = Vec::new();
    for code in spec_codes.iter() {
        let c = client.clone();
        let d = tech_cache_dir.to_path_buf();
        let code = code.clone();
        spec_tasks.push(tokio::spawn(async move {
            (code.clone(), load_technical_dictionary(c, d, code).await)
        }));
    }

    let mut language_dicts: Vec<(String, String)> = Vec::new();
    let mut technical_words = HashSet::new();

    let mut dict_results: Vec<(usize, _)> = Vec::new();
    for task in dict_tasks {
        if cancel.load(Ordering::SeqCst) {
            log::info!("[SPELLCHECK-RUST] Download cancelled, aborting language dictionaries");
            break;
        }
        if let Ok((i, res)) = task.await {
            done += 1;
            progress(done, total);
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
        if cancel.load(Ordering::SeqCst) {
            log::info!("[SPELLCHECK-RUST] Download cancelled, aborting supplemental dictionaries");
            break;
        }
        if let Ok((code, res)) = task.await {
            done += 1;
            progress(done, total);
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

pub fn build_combined_dic_string(words: &HashSet<String>) -> Option<(String, usize)> {
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
