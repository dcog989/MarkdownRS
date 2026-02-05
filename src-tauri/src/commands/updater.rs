use serde::{Deserialize, Serialize};
use velopack::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub release_notes: Option<String>,
}

#[tauri::command]
pub fn check_for_updates() -> Result<UpdateInfo, String> {
    let source = sources::HttpSource::new("https://github.com/dcog989/markdown-rs/releases/latest");

    let update_manager = UpdateManager::new(source, None, None)
        .map_err(|e| format!("Failed to create update manager: {}", e))?;

    match update_manager.check_for_updates() {
        Ok(update_check) => {
            match update_check {
                UpdateCheck::UpdateAvailable(update_info) => {
                    Ok(UpdateInfo {
                        available: true,
                        version: Some(update_info.TargetFullRelease.Version.to_string()),
                        release_notes: None, // VelopackAsset doesn't have release notes
                    })
                },
                _ => Ok(UpdateInfo {
                    available: false,
                    version: None,
                    release_notes: None,
                }),
            }
        },
        Err(e) => Err(format!("Failed to check for updates: {}", e)),
    }
}

#[tauri::command]
pub fn download_and_install_update() -> Result<(), String> {
    let source = sources::HttpSource::new("https://github.com/dcog989/markdown-rs/releases/latest");

    let update_manager = UpdateManager::new(source, None, None)
        .map_err(|e| format!("Failed to create update manager: {}", e))?;

    let update_check = update_manager
        .check_for_updates()
        .map_err(|e| format!("Failed to check for updates: {}", e))?;

    let update_info = match update_check {
        UpdateCheck::UpdateAvailable(info) => info,
        _ => {
            return Err("No update available".to_string());
        },
    };

    log::info!(
        "Downloading update version: {}",
        update_info.TargetFullRelease.Version
    );

    update_manager
        .download_updates(&update_info, None)
        .map_err(|e| format!("Failed to download update: {}", e))?;

    log::info!("Applying update...");

    update_manager
        .unsafe_apply_updates(
            &update_info.TargetFullRelease,
            false,
            ApplyWaitMode::NoWait,
            false,
            Vec::<String>::new(),
        )
        .map_err(|e| format!("Failed to apply update: {}", e))?;

    Ok(())
}
