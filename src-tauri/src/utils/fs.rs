use std::path::Path;
use tokio::fs;
use tokio::io::AsyncWriteExt;

pub async fn atomic_write(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let file_name = path
        .file_name()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid path"))?
        .to_string_lossy();
    let temp_path = path.with_file_name(format!("{}.{}.tmp", file_name, uuid::Uuid::new_v4()));

    {
        let mut file = tokio::fs::File::create(&temp_path).await?;
        file.write_all(content).await?;
        file.sync_all().await?;
    }

    if let Err(e) = fs::rename(&temp_path, path).await {
        let _ = fs::remove_file(&temp_path).await;
        return Err(e);
    }
    Ok(())
}

pub async fn cleanup_stale_temp_files(
    dir: &Path,
    max_age: std::time::Duration,
) -> std::io::Result<()> {
    let mut entries = fs::read_dir(dir).await?;
    let now = std::time::SystemTime::now();

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("tmp") {
            continue;
        }

        let Ok(metadata) = entry.metadata().await else {
            continue;
        };

        let Ok(modified) = metadata.modified() else {
            continue;
        };

        let Ok(age) = now.duration_since(modified) else {
            continue;
        };

        if age > max_age {
            if let Err(e) = fs::remove_file(&path).await {
                log::warn!("Failed to remove stale temp file {:?}: {}", path, e);
            } else {
                log::info!("Cleaned up stale temp file: {:?}", path);
            }
        }
    }

    Ok(())
}
