use crate::commands::settings::get_max_file_size_bytes;
use crate::utils::{decode_text, encode_text, handle_error, validate_path};
use encoding_rs::Encoding;
use serde::Serialize;
use std::path::PathBuf;
use tokio::fs;

fn bytes_to_mb(bytes: u64) -> u64 {
    bytes / 1024 / 1024
}

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
    pub encoding: String,
    pub has_bom: bool,
}

#[derive(Serialize)]
pub struct WriteFileResult {
    pub bytes_written: u64,
    pub encoding: String,
    pub has_bom: bool,
}

#[tauri::command]
pub async fn read_text_file(path: String, app_handle: tauri::AppHandle) -> Result<FileContent, String> {
    let (result, duration) = crate::timed!({
        validate_path(&path)?;
        let metadata = fs::metadata(&path)
            .await
            .map_err(|e| handle_error(Some(&path), "read metadata", e))?;

        if metadata.is_dir() {
            log::warn!("Attempted to read directory as file: {}", path);
            return Err("Cannot read a directory as a text file".to_string());
        }

        let max_file_size = get_max_file_size_bytes(&app_handle).await;

        if metadata.len() > max_file_size {
            log::warn!("File too large to read: {} ({} MB)", path, bytes_to_mb(metadata.len()));
            return Err(format!(
                "File too large: {} MB (max {} MB)",
                bytes_to_mb(metadata.len()),
                bytes_to_mb(max_file_size)
            ));
        }

        let bytes = fs::read(&path)
            .await
            .map_err(|e| handle_error(Some(&path), "read file", e))?;

        let (content, encoding, has_bom) = decode_text(bytes);
        Ok::<_, String>(FileContent {
            content,
            encoding,
            has_bom,
        })
    });
    let result = result?;

    log::info!(
        "[Storage] read_text_file | duration={:?} | size={} bytes | path={}",
        duration,
        result.content.len(),
        path
    );

    Ok(result)
}

#[tauri::command]
pub async fn write_text_file(
    path: String,
    content: String,
    encoding: Option<String>,
    has_bom: Option<bool>,
) -> Result<WriteFileResult, String> {
    let content_size = content.len();

    crate::timed_info!(
        "[Storage]",
        "write_text_file",
        {
            validate_path(&path)?;
            let path_buf = PathBuf::from(&path);

            let encoding_name = encoding.unwrap_or_else(|| "UTF-8".to_string());
            let encoding = Encoding::for_label(encoding_name.as_bytes())
                .ok_or_else(|| format!("Unsupported encoding '{}'", encoding_name))?;
            let requested_bom = has_bom.unwrap_or(false);

            let (bytes, written_encoding, written_has_bom) = match encode_text(&content, encoding, requested_bom) {
                Ok(bytes) => (bytes, encoding.name().to_string(), requested_bom),
                Err(()) => {
                    // The edited content holds characters the original
                    // encoding cannot represent (e.g. an emoji pasted into
                    // a windows-1252 file); re-encoding would silently
                    // corrupt them, so fall back to UTF-8 without a BOM and
                    // report it so the tab's encoding stays truthful.
                    log::warn!(
                        "Content not representable in {}, falling back to UTF-8: {}",
                        encoding.name(),
                        path
                    );
                    (content.as_bytes().to_vec(), "UTF-8".to_string(), false)
                },
            };

            crate::utils::atomic_write(&path_buf, &bytes)
                .await
                .map_err(|e| handle_error(Some(&path), "save file", e))?;

            Ok::<_, String>(WriteFileResult {
                bytes_written: bytes.len() as u64,
                encoding: written_encoding,
                has_bom: written_has_bom,
            })
        },
        size = content_size,
        path = path,
    )
}

#[tauri::command]
pub async fn write_binary_file(path: String, content: Vec<u8>) -> Result<(), String> {
    validate_path(&path)?;
    let path_buf = PathBuf::from(&path);

    crate::utils::atomic_write(&path_buf, &content)
        .await
        .map_err(|e| handle_error(Some(&path), "write binary file", e))?;

    log::debug!("Successfully wrote binary file: {}", path);
    Ok(())
}
