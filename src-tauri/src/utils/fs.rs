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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::Duration;
    use uuid::Uuid;

    fn temp_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!("markdownrs-fs-test-{}-{}", name, Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test(flavor = "current_thread")]
    async fn atomic_write_writes_content_to_target_path() {
        let dir = temp_dir("write");
        let target = dir.join("notes.md");

        atomic_write(&target, b"# Hello\n\nBody").await.unwrap();

        assert_eq!(std::fs::read_to_string(&target).unwrap(), "# Hello\n\nBody");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn atomic_write_does_not_leave_temp_files_behind() {
        let dir = temp_dir("cleanup");
        let target = dir.join("notes.md");

        atomic_write(&target, b"content").await.unwrap();

        let leftover: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .filter(|n| n.to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(
            leftover.is_empty(),
            "temp files left behind: {:?}",
            leftover
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test(flavor = "current_thread")]
    async fn atomic_write_rejects_paths_without_a_file_name() {
        let result = atomic_write(Path::new("/"), b"x").await;
        assert!(result.is_err());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn cleanup_stale_temp_files_removes_old_tmp_files_only() {
        let dir = temp_dir("stale");
        let old = dir.join("old.tmp");
        let fresh = dir.join("fresh.tmp");
        let keep = dir.join("keep.md");
        std::fs::write(&old, "old").unwrap();
        std::fs::write(&fresh, "fresh").unwrap();
        std::fs::write(&keep, "keep").unwrap();

        let past = std::time::SystemTime::now() - Duration::from_secs(3600);
        std::fs::File::open(&old)
            .unwrap()
            .set_modified(past)
            .unwrap();
        std::fs::File::open(&fresh)
            .unwrap()
            .set_modified(std::time::SystemTime::now())
            .unwrap();

        cleanup_stale_temp_files(&dir, Duration::from_secs(60))
            .await
            .unwrap();

        assert!(!old.exists(), "old .tmp should be removed");
        assert!(fresh.exists(), "fresh .tmp should be kept");
        assert!(keep.exists(), "non-tmp files should be kept");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
