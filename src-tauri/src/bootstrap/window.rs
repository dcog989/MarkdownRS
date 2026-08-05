use tauri::Emitter;

const WINDOW_SHOW_DELAY_MS: u64 = 150;
const WINDOW_FOCUS_DELAY_MS: u64 = 50;
const WINDOW_EMIT_DELAY_MS: u64 = 200;

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
    let args: Vec<String> = std::env::args_os()
        .skip(1)
        .filter(|a| !a.to_string_lossy().starts_with('-'))
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    if let Some(file_path) = args.into_iter().next() {
        let window_clone = window.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(WINDOW_SHOW_DELAY_MS)).await;
            let _ = window_clone.show();
            tokio::time::sleep(std::time::Duration::from_millis(WINDOW_FOCUS_DELAY_MS)).await;
            let _ = window_clone.set_focus();
            tokio::time::sleep(std::time::Duration::from_millis(WINDOW_EMIT_DELAY_MS)).await;
            log::info!("Opening file from initial launch: {}", file_path);
            let _ = window_clone.emit("open-file-from-args", &file_path);
        });
    } else {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(WINDOW_SHOW_DELAY_MS)).await;
            let _ = window.show();
            tokio::time::sleep(std::time::Duration::from_millis(WINDOW_FOCUS_DELAY_MS)).await;
            let _ = window.set_focus();
        });
    }
}
