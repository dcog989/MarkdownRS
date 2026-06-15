#[cfg(target_os = "windows")]
mod registry;

#[tauri::command]
pub async fn set_context_menu_item(_enable: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if _enable {
            registry::set_context_menu()
        } else {
            registry::remove_context_menu()
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Context menu integration is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub async fn check_context_menu_status() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(registry::check_context_menu())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}
