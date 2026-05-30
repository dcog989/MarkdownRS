use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub release_notes: Option<String>,
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    Ok(UpdateInfo {
        available: false,
        version: None,
        release_notes: None,
    })
}

#[tauri::command]
pub async fn download_and_install_update() -> Result<(), String> {
    Err("Updates are not enabled in this build".to_string())
}
