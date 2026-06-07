use super::dicts;
use anyhow::{Result, anyhow};
use std::path::PathBuf;
use tokio::fs;

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
                            let _ = fs::remove_file(cache_path).await;
                            return Err(anyhow!("Write error: {}", e));
                        }
                        read_cache_or_delete(cache_path, label).await
                    },
                    Err(e) => {
                        log::error!("Failed to decode {}: {}", label, e);
                        Err(anyhow!("Text decode error: {}", e))
                    },
                }
            } else {
                log::warn!("Failed to download {}: Status {}", label, resp.status());
                Err(anyhow!("HTTP Error: {}", resp.status()))
            }
        },
        Err(e) => {
            log::error!("Network error downloading {}: {}", label, e);
            Err(anyhow!("Network error: {}", e))
        },
    }
}

pub async fn load_language_dictionary(
    client: reqwest::Client,
    cache_dir: PathBuf,
    dict_code: String,
) -> Result<(String, String)> {
    let aff_path = cache_dir.join(format!("{}.aff", dict_code));
    let dic_path = cache_dir.join(format!("{}.dic", dict_code));

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
    let cache_path = cache_dir.join(format!("{}.txt", id));

    ensure_file_downloaded(&client, url, &cache_path, &id).await
}
