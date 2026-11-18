use tauri::WebviewWindow;

/// Open a URL in the user's browser.
///
/// Linux launches through GTK rather than the opener plugin: only GTK's app
/// launch context acquires an `xdg_activation` token, and without it Wayland
/// compositors refuse to focus the newly opened browser window. The command is
/// deliberately synchronous: Tauri runs it inline on the GTK main thread.
#[tauri::command]
pub fn open_external_url(window: WebviewWindow, url: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
        gtk::show_uri_on_window(Some(&gtk_window), &url, gtk::current_event_time()).map_err(|error| error.to_string())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = window;
        tauri_plugin_opener::open_url(url, None::<&str>).map_err(|error| error.to_string())
    }
}
