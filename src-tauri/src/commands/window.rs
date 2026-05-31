// HACK: `tauri_window.set_title()` silently fails on Wayland because Tauri's
// WebKitGTK backend doesn't propagate the title change to the compositor.
// Workaround: https://github.com/tauri-apps/tauri/issues/13749
//
// On Wayland without CSD (native decorations), `gtk_window.set_title()` is
// called as a direct GTK fallback instead.
// On Wayland with CSD (custom titlebar), the widget tree
// (titlebar -> EventBox -> HeaderBar) is walked and the title is applied
// directly to the HeaderBar widget.
//
// Remove this entire command and revert to `getCurrentWindow().setTitle()` in
// the frontend once https://github.com/tauri-apps/tauri/issues/13749 is resolved.

use tauri::AppHandle;
use tauri::Manager;

#[cfg(target_os = "linux")]
use gtk::prelude::{BinExt, Cast, GtkWindowExt, HeaderBarExt};
#[cfg(target_os = "linux")]
use gtk::{EventBox, HeaderBar};

#[tauri::command]
pub async fn set_window_title(app: AppHandle, title: String) -> Result<(), String> {
    let tauri_window = app
        .get_webview_window("main")
        .ok_or_else(|| "Failed to get main window".to_string())?;

    tauri_window.set_title(&title).map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        if let Ok(gtk_window) = tauri_window.gtk_window() {
            gtk_window.set_title(&title);
            if let Some(titlebar) = gtk_window.titlebar()
                && let Ok(event_box) = titlebar.downcast::<EventBox>()
                && let Some(child) = event_box.child()
                && let Ok(header_bar) = child.downcast::<HeaderBar>()
            {
                header_bar.set_title(Some(&title));
            }
        }
    }

    Ok(())
}
