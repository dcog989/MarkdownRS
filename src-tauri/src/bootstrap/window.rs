use std::path::Path;
use tauri::{Emitter, Listener};

const DARK_BACKGROUND: &str = "#1e1e1e";
const LIGHT_BACKGROUND: &str = "#fcfcfc";

/// The page paints no background until the frontend has loaded the theme, so the
/// window's own background is what fills the gap. Match it to the saved theme.
pub fn apply_saved_background(window: &tauri::WebviewWindow, settings_path: &Path) {
    let is_light = crate::utils::read_settings_toml(settings_path)
        .ok()
        .is_some_and(|settings| settings.get("theme").and_then(|v| v.as_str()) == Some("light"));
    let color = if is_light {
        LIGHT_BACKGROUND
    } else {
        DARK_BACKGROUND
    };

    match color.parse::<tauri::utils::config::Color>() {
        Ok(color) => {
            if let Err(e) = window.set_background_color(Some(color)) {
                log::warn!("Failed to set window background color: {}", e);
            }
        },
        Err(e) => log::warn!("Invalid window background color: {}", e),
    }
}

#[cfg(target_os = "linux")]
pub fn configure(window: &tauri::WebviewWindow) {
    use gtk::gdk::EventMask;
    use gtk::prelude::{GtkWindowExt, WidgetExt, WidgetExtManual};

    const ICON_BYTES: &[u8] = include_bytes!("../../icons/128x128@2x.png");
    if let Ok(img) = image::load_from_memory(ICON_BYTES) {
        let rgba = img.into_rgba8();
        let (w, h) = rgba.dimensions();
        let icon = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
        let _ = window.set_icon(icon);
    }

    if let Ok(gtk_window) = window.gtk_window() {
        gtk_window.set_titlebar(None::<&gtk::Widget>);
    }

    // WebKitGTK doesn't dispatch DOM mouseout/mouseleave on fast window exit
    // (tauri-apps/tauri#5179), so native leave-notify on the webview widget is
    // the reliable trigger; hooking the outer GtkWindow misses it because the
    // webview's own GdkWindow absorbs the crossing events. On re-entry it also
    // skips the initial hover for the element under the cursor, so enter-notify
    // reports the cursor position for the frontend to re-activate it.
    let emit_window = window.clone();
    let _ = window.with_webview(move |webview| {
        let webview = webview.inner();
        webview.add_events(EventMask::LEAVE_NOTIFY_MASK | EventMask::ENTER_NOTIFY_MASK);
        let enter_window = emit_window.clone();
        webview.connect_enter_notify_event(move |_, event| {
            let (x, y) = event.position();
            let _ = enter_window.emit("window-cursor-enter", (x, y));
            gtk::glib::Propagation::Proceed
        });
        webview.connect_leave_notify_event(move |_, _| {
            let _ = emit_window.emit("window-cursor-left", ());
            gtk::glib::Propagation::Proceed
        });
    });
}

#[cfg(not(target_os = "linux"))]
pub fn configure(_window: &tauri::WebviewWindow) {}

pub fn handle_cli_args(window: tauri::WebviewWindow) {
    let Some(file_path) = std::env::args_os()
        .skip(1)
        .filter(|a| !a.to_string_lossy().starts_with('-'))
        .map(|a| a.to_string_lossy().into_owned())
        .next()
    else {
        return;
    };

    // The window is shown at creation. Wait for the frontend to report that its
    // listeners exist and the session is restored, rather than guessing.
    let emit_window = window.clone();
    window.listen("frontend-ready", move |_| {
        log::info!("Opening file from initial launch: {}", file_path);
        let _ = emit_window.emit("open-file-from-args", &file_path);
    });
}
