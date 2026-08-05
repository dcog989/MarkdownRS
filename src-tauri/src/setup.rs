use crate::commands::settings::themes;
use crate::migration;
use crate::portable;
use crate::state;
use crate::utils;
use log::LevelFilter;
use std::fs;
use std::path::PathBuf;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

fn default_log_level() -> String {
    "info".to_string()
}

#[cfg(target_os = "linux")]
fn configure_linux_window(window: &tauri::WebviewWindow) {
    use gtk::gdk::EventMask;
    use gtk::prelude::{GtkWindowExt, WidgetExt, WidgetExtManual};

    const ICON_BYTES: &[u8] = include_bytes!("../icons/128x128@2x.png");
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
fn configure_linux_window(_window: &tauri::WebviewWindow) {}

fn read_log_level_from_settings(config_path: &std::path::Path) -> String {
    match crate::commands::settings::io::read_and_parse_sync(config_path) {
        Ok(toml_val) => toml_val
            .get("logLevel")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(default_log_level),
        Err(_) => default_log_level(),
    }
}

fn parse_log_level(level: &str) -> LevelFilter {
    match level {
        s if s.eq_ignore_ascii_case("error") => LevelFilter::Error,
        s if s.eq_ignore_ascii_case("warn") || s.eq_ignore_ascii_case("warning") => {
            LevelFilter::Warn
        },
        s if s.eq_ignore_ascii_case("info") => LevelFilter::Info,
        s if s.eq_ignore_ascii_case("trace") => LevelFilter::Trace,
        s if s.eq_ignore_ascii_case("off") => LevelFilter::Off,
        _ => LevelFilter::Debug,
    }
}

fn init_database(
    db_path: std::path::PathBuf,
    db_dir: &std::path::Path,
) -> Result<crate::db::Database, String> {
    match crate::db::Database::new(db_path.clone()) {
        Ok(db) => Ok(db),
        Err(e) => {
            log::error!("Failed to initialize database: {}", e);
            log::warn!("Attempting database recovery...");

            if db_path.exists() {
                let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
                let backup_path = db_dir.join(format!("session.db.bak.{}", timestamp));

                if let Err(io_err) = fs::rename(&db_path, &backup_path) {
                    log::error!("Failed to rename corrupted database: {}", io_err);
                    return Err(format!(
                        "Database corruption detected. Failed to backup: {}",
                        io_err
                    ));
                }
                log::info!("Corrupted database moved to {:?}", backup_path);
            }

            // Sidecar files belong to the failed DB whether or not the main
            // file still exists (it may have vanished since the failed open);
            // leaving them behind can break opening the fresh database.
            remove_sidecar_files(&db_path, &["-wal", "-shm"]);

            crate::db::Database::new(db_path).map_err(|retry_err| {
                log::error!("Failed to initialize fresh database: {}", retry_err);
                format!(
                    "Critical: Failed to create new database after corruption: {}",
                    retry_err
                )
            })
        },
    }
}

/// Remove SQLite WAL/SHM sidecar files for a database path.
/// They belong to the pre-recovery database and must not survive the
/// main file being renamed away, or opening the fresh DB at the same
/// path can hit `SQLITE_NOTADB` / mismatch errors.
fn remove_sidecar_files(db_path: &std::path::Path, suffixes: &[&str]) {
    for suffix in suffixes {
        let path = PathBuf::from(format!("{}{}", db_path.display(), suffix));
        if path.exists() {
            match fs::remove_file(&path) {
                Ok(()) => log::info!("Removed orphaned sidecar file {:?}", path),
                Err(e) => log::warn!("Failed to remove sidecar file {:?}: {}", path, e),
            }
        }
    }
}

const WINDOW_SHOW_DELAY_MS: u64 = 150;
const WINDOW_FOCUS_DELAY_MS: u64 = 50;
const WINDOW_EMIT_DELAY_MS: u64 = 200;

fn handle_cli_args(window: tauri::WebviewWindow) {
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

struct AppPaths {
    local_dir: std::path::PathBuf,
    config_dir: std::path::PathBuf,
    db_dir: std::path::PathBuf,
    log_dir: std::path::PathBuf,
    themes_dir: std::path::PathBuf,
    config_path: std::path::PathBuf,
    dict_path: std::path::PathBuf,
}

fn resolve_app_paths(
    app_handle: &tauri::AppHandle,
) -> Result<AppPaths, Box<dyn std::error::Error>> {
    let local_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get local data dir: {}", e))?;
    let config_dir = utils::app_config_dir(app_handle)
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    Ok(AppPaths {
        db_dir: config_dir.join("Database"),
        log_dir: local_dir.join("Logs"),
        themes_dir: config_dir.join("Themes"),
        config_path: config_dir.join("settings.toml"),
        dict_path: utils::custom_dict_path(&config_dir),
        local_dir,
        config_dir,
    })
}

fn ensure_directories(paths: &AppPaths) {
    for dir in [
        &paths.local_dir,
        &paths.config_dir,
        &paths.db_dir,
        &paths.log_dir,
        &paths.themes_dir,
    ] {
        if let Err(e) = fs::create_dir_all(dir) {
            log::warn!("Failed to create directory {:?}: {}", dir, e);
        }
    }
}

fn schedule_temp_cleanup(local_dir: std::path::PathBuf, config_dir: std::path::PathBuf) {
    tauri::async_runtime::spawn(async move {
        let one_hour = std::time::Duration::from_secs(3600);
        if let Err(e) = utils::cleanup_stale_temp_files(&local_dir, one_hour).await {
            log::warn!("Failed to cleanup temp files in local dir: {}", e);
        }
        if let Err(e) = utils::cleanup_stale_temp_files(&config_dir, one_hour).await {
            log::warn!("Failed to cleanup temp files in config dir: {}", e);
        }
    });
}

fn log_runtime_info(paths: &AppPaths) {
    log::info!("Portable Mode: {}", portable::is_portable_mode());
    log::info!("Config Directory: {:?}", paths.config_dir);
    log::info!("Cache Directory: {:?}", paths.local_dir);
}

fn seed_default_themes(themes_dir: std::path::PathBuf) {
    tauri::async_runtime::spawn(async move {
        for (name, css) in themes::TEMPLATE_THEMES {
            let theme_path = themes_dir.join(format!("{}.css", name));
            if tokio::fs::try_exists(&theme_path).await.unwrap_or(false) {
                continue;
            }
            if let Err(e) = tokio::fs::write(&theme_path, css).await {
                log::warn!("Failed to write theme '{}': {}", name, e);
            }
        }
    });
}

fn setup_logging(
    app_handle: &tauri::AppHandle,
    config_path: &std::path::Path,
    log_dir: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let settings_level = read_log_level_from_settings(config_path);
    let log_level = parse_log_level(&settings_level);

    eprintln!(
        "[INFO] Initializing logger with level: {:?} (source: '{}')",
        log_level, settings_level
    );

    app_handle.plugin(
        tauri_plugin_log::Builder::default()
            .level(log_level)
            .level_for("tao", LevelFilter::Error)
            .level_for("wry", LevelFilter::Error)
            .level_for("markdown_rs", log_level)
            .max_file_size(2 * 1024 * 1024)
            .rotation_strategy(RotationStrategy::KeepSome(9))
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::Folder {
                    path: log_dir.to_path_buf(),
                    file_name: Some("markdown-rs".into()),
                }),
                Target::new(TargetKind::Webview),
            ])
            .build(),
    )?;

    Ok(())
}

fn ensure_dictionary_file(dict_path: &std::path::Path) {
    if !dict_path.exists()
        && let Err(e) = fs::write(dict_path, "")
    {
        log::warn!("Failed to create custom dictionary file: {}", e);
    }
}

fn manage_app_state(app: &mut tauri::App, db: crate::db::Database) {
    app.manage(state::AppState {
        db,
        speller: std::sync::Arc::new(std::sync::Mutex::new(None)),
        custom_dict: std::sync::RwLock::new(std::sync::Arc::new(std::collections::HashSet::new())),
        spellcheck_status: std::sync::Mutex::new(state::SpellcheckStatus::Uninitialized),
        max_file_size_bytes: std::sync::atomic::AtomicU64::new(state::MAX_FILE_SIZE_UNSET),
        project_root: std::sync::Mutex::new(None),
    });
}

pub fn run(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let window = app
        .get_webview_window("main")
        .ok_or("Failed to get main window")?;

    configure_linux_window(&window);

    let paths = resolve_app_paths(app_handle)?;
    fs::create_dir_all(&paths.log_dir)?;
    setup_logging(app_handle, &paths.config_path, &paths.log_dir)?;
    migration::migrate_to_config(&paths.local_dir, &paths.config_dir);
    ensure_directories(&paths);
    schedule_temp_cleanup(paths.local_dir.clone(), paths.config_dir.clone());
    log_runtime_info(&paths);
    seed_default_themes(paths.themes_dir);
    ensure_dictionary_file(&paths.dict_path);

    let db = init_database(paths.db_dir.join("session.db"), &paths.db_dir)?;
    manage_app_state(app, db);
    handle_cli_args(window);

    Ok(())
}
