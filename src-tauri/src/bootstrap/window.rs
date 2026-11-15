use tauri::{Emitter, Listener};

const DARK_BACKGROUND: &str = "#1e1e1e";
const LIGHT_BACKGROUND: &str = "#fcfcfc";

static FRONTEND_READY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// The page paints no background until the frontend has loaded the theme, so the
/// window's own background is what fills the gap. Match it to the saved theme.
pub fn apply_saved_background(window: &tauri::WebviewWindow, settings: Option<&toml::Value>) {
    let is_light = settings.is_some_and(|s| s.get("theme").and_then(|v| v.as_str()) == Some("light"));
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
    use gtk::prelude::{WidgetExt, WidgetExtManual};

    // WebKitGTK can skip the page's mouseleave when the pointer leaves the
    // window, so a pending tooltip would otherwise appear after the pointer is
    // gone. The native leave-notify is the reliable exit signal.
    let emit_window = window.clone();
    let _ = window.with_webview(move |webview| {
        let webview = webview.inner();
        webview.add_events(EventMask::LEAVE_NOTIFY_MASK);
        webview.connect_leave_notify_event(move |_, _| {
            let _ = emit_window.emit("window-cursor-left", ());
            gtk::glib::Propagation::Proceed
        });
    });
}

#[cfg(not(target_os = "linux"))]
pub fn configure(_window: &tauri::WebviewWindow) {}

pub fn handle_cli_args(window: tauri::WebviewWindow) {
    queue_open_paths(
        &window,
        cli_file_args(std::env::args_os().skip(1).map(|a| a.to_string_lossy().into_owned())),
    );

    // The window is shown at creation. Wait for the frontend to report that its
    // listeners exist and the session is restored, rather than guessing.
    let emit_window = window.clone();
    window.listen("frontend-ready", move |_| {
        FRONTEND_READY.store(true, std::sync::atomic::Ordering::SeqCst);
        emit_pending_open_paths(&emit_window);
    });
}

/// Non-flag arguments, whether the app is the first instance or a second one.
pub fn cli_file_args(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter().filter(|a| !a.starts_with('-')).collect()
}

/// Files from a second launch, held until the frontend is ready to receive them.
pub fn queue_open_paths(window: &tauri::WebviewWindow, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }

    pending_open_paths()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .extend(paths);

    if FRONTEND_READY.load(std::sync::atomic::Ordering::SeqCst) {
        emit_pending_open_paths(window);
    }
}

fn pending_open_paths() -> &'static std::sync::Mutex<Vec<String>> {
    static PENDING: std::sync::OnceLock<std::sync::Mutex<Vec<String>>> = std::sync::OnceLock::new();
    PENDING.get_or_init(|| std::sync::Mutex::new(Vec::new()))
}

fn emit_pending_open_paths(window: &tauri::WebviewWindow) {
    let paths = std::mem::take(&mut *pending_open_paths().lock().unwrap_or_else(|e| e.into_inner()));
    for file_path in paths {
        log::info!("Opening file from command line: {}", file_path);
        let _ = window.emit("open-file-from-args", &file_path);
    }
}
