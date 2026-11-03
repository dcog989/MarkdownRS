pub mod database;
pub mod desktop;
pub mod logging;
pub mod paths;
pub mod state;
pub mod window;

use crate::migration;
use std::fs;
use std::time::Instant;
use tauri::Manager;

static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

/// Marks process start so startup timings include the work done before the
/// logger exists (webview creation, plugin setup).
pub fn mark_start() {
    let _ = START.set(Instant::now());
}

fn since_start_ms() -> f64 {
    START.get().map_or(0.0, |start| start.elapsed().as_secs_f64() * 1000.0)
}

fn ms(start: &Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

pub fn run(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let phase = Instant::now();
    let app_handle = app.handle();
    let window = app.get_webview_window("main").ok_or("Failed to get main window")?;

    window::configure(&window);
    let window_ms = ms(&phase);

    let phase = Instant::now();
    let paths = paths::resolve_app_paths(app_handle)?;
    // Migration runs before the first read: an upgrade still keeps its
    // settings in the old location until they are moved.
    migration::migrate_to_config(&paths.local_dir, &paths.config_dir);
    // The window background and the log level both come from settings, so the
    // file is read once instead of once per consumer.
    let saved_settings = crate::utils::read_settings_toml(&paths.config_path).ok();
    // Before anything slow: the window is already visible, so the theme colour
    // should replace the static fallback as early as possible.
    window::apply_saved_background(&window, saved_settings.as_ref());
    let config_ms = ms(&phase);

    // Logging is optional: a read-only or full disk must not block startup.
    let phase = Instant::now();
    if let Err(e) = fs::create_dir_all(&paths.log_dir) {
        eprintln!("[WARN] Failed to create log directory {:?}: {}", paths.log_dir, e);
    }
    if let Err(e) = logging::init(saved_settings.as_ref(), &paths.log_dir) {
        eprintln!("[WARN] Logging initialization failed: {}", e);
    }
    log::debug!(
        "Startup phases: window {:.2}ms, config {:.2}ms, logger {:.2}ms",
        window_ms,
        config_ms,
        ms(&phase)
    );

    let phase = Instant::now();
    paths::ensure_directories(&paths);
    logging::log_runtime_info(&paths);
    desktop::install_appimage_integration();
    paths::ensure_dictionary_file(&paths.dict_path);
    let prep_ms = ms(&phase);

    let phase = Instant::now();
    let db = database::init(paths.db_dir.join("session.db"), &paths.db_dir)?;
    database::schedule_vacuum(app_handle);
    state::manage(app, db);
    window::handle_cli_args(window);
    log::debug!(
        "Startup phases: directories {:.2}ms, database+state {:.2}ms",
        prep_ms,
        ms(&phase)
    );
    log::debug!("Startup: backend ready {:.2}ms after process start", since_start_ms());

    Ok(())
}
