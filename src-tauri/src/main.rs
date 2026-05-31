// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod markdown;
mod state;
mod utils;

#[cfg(target_os = "linux")]
use gtk::prelude::GtkWindowExt;
use log::LevelFilter;
use std::fs;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use std::sync::OnceLock;

fn default_log_level() -> String {
    "info".to_string()
}

struct PortableConfig {
    is_portable: bool,
    data_dir: Option<std::path::PathBuf>,
}

/// Populated once in `main()` before Tauri (or any other thread) starts.
/// Everything that needs portable-mode info reads from here instead of the
/// environment, so we never need to call `set_var` after threads exist.
static PORTABLE_CONFIG: OnceLock<PortableConfig> = OnceLock::new();

/// Returns `true` if the app is running in portable mode.
pub fn is_portable_mode() -> bool {
    PORTABLE_CONFIG.get().is_some_and(|c| c.is_portable)
}

/// Returns the portable data directory, if any.
pub fn portable_data_dir() -> Option<&'static std::path::PathBuf> {
    PORTABLE_CONFIG.get().and_then(|c| c.data_dir.as_ref())
}

/// One-time migration: move data from the old bare "MarkdownRS" identifier path
/// to the new reverse-DNS "com.markdownrs.app" path used by Tauri on Linux.
/// Safe to call repeatedly — does nothing if already migrated or not on Linux.
#[cfg(target_os = "linux")]
fn migrate_data_dir_if_needed() {
    use std::path::PathBuf;
    let Some(base) = dirs::data_dir() else { return };
    let new_path: PathBuf = base.join("com.markdownrs.editor");
    if new_path.exists() {
        return;
    }
    for old_name in ["MarkdownRS", "com.markdownrs.app"] {
        let old_path = base.join(old_name);
        if old_path.exists() {
            match fs::rename(&old_path, &new_path) {
                Ok(_) => eprintln!("[INFO] Migrated app data: {:?} -> {:?}", old_path, new_path),
                Err(e) => eprintln!("[WARN] Data migration failed: {}", e),
            }
            return;
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn migrate_data_dir_if_needed() {}

fn detect_portable_mode() -> PortableConfig {
    let exe_path = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!(
                "[WARN] Could not determine executable path: {} — portable mode disabled",
                e
            );
            return PortableConfig {
                is_portable: false,
                data_dir: None,
            };
        },
    };
    let exe_dir = match exe_path.parent() {
        Some(d) => d,
        None => {
            eprintln!("[WARN] Executable has no parent directory — portable mode disabled");
            return PortableConfig {
                is_portable: false,
                data_dir: None,
            };
        },
    };
    let portable_marker = exe_dir.join(".portable");

    if portable_marker.exists() {
        let portable_data_dir = exe_dir.join("Data");
        PortableConfig {
            is_portable: true,
            data_dir: Some(portable_data_dir),
        }
    } else {
        PortableConfig {
            is_portable: false,
            data_dir: None,
        }
    }
}

fn main() {
    migrate_data_dir_if_needed();

    // Detect and configure portable mode BEFORE any threading.
    // Store in a static so setup() can read it without touching the environment.
    let portable_config = detect_portable_mode();
    let is_portable = portable_config.is_portable;
    let portable_data_dir_path = portable_config.data_dir.clone();
    // Ignore the error — if it's already set we just use what's there.
    let _ = PORTABLE_CONFIG.set(portable_config);

    // The APPDATA/LOCALAPPDATA overrides must still go into the environment
    // because Tauri's path resolver reads them via `dirs` before our setup
    // closure runs.  These are the only remaining `set_var` calls, and they
    // happen here — before Tauri (or any plugin) spawns threads.
    if is_portable && let Some(ref data_dir) = portable_data_dir_path {
        // SAFETY: no other threads exist at this point in main().
        unsafe {
            std::env::set_var("APPDATA", data_dir.as_os_str());
            std::env::set_var("LOCALAPPDATA", data_dir.as_os_str());
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Safe: Called before any threads are spawned
        unsafe {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--disable-features=CalculateNativeWinOcclusion --disable-direct-composition",
            );
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let windows = app.webview_windows();
            if let Some((_, window)) = windows.iter().next() {
                let _ = window.set_focus();
                let _ = window.unminimize();

                if args.len() > 1 {
                    let file_path = &args[1];
                    log::info!("Opening file from command line: {}", file_path);
                    let _ = window.emit("open-file-from-args", file_path);
                }
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())

        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all())
                .with_filename(".window-state.json")
                .build(),
        )
        .setup(|app| {
            let app_handle = app.handle();
            let window = app.get_webview_window("main")
                .ok_or("Failed to get main window")?;

            #[cfg(target_os = "linux")]
            {
                const ICON_BYTES: &[u8] = include_bytes!("../icons/128x128@2x.png");
                if let Ok(img) = image::load_from_memory(ICON_BYTES) {
                    let rgba = img.into_rgba8();
                    let (w, h) = rgba.dimensions();
                    let icon = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
                    let _ = window.set_icon(icon);
                }

                // Remove the GTK CSD titlebar so the window manager (KDE/GNOME)
                // applies native server-side decorations instead.
                if let Ok(gtk_window) = window.gtk_window() {
                    gtk_window.set_titlebar(None::<&gtk::Widget>);
                }
            }

            // Check if portable mode is enabled via the static config.
            let is_portable = is_portable_mode();

            // Get app directories - these will use the overridden APPDATA if in portable mode
            let local_dir = app_handle
                .path()
                .app_local_data_dir()
                .map_err(|e| {
                    log::error!("Failed to get local data dir: {}", e);
                    format!("Failed to get local data dir: {}", e)
                })?;

            let config_dir = app_handle
                .path()
                .app_config_dir()
                .map_err(|e| {
                    log::error!("Failed to get app config dir: {}", e);
                    format!("Failed to get app config dir: {}", e)
                })?;

            let db_dir = config_dir.join("Database");
            let log_dir = local_dir.join("Logs");
            let themes_dir = config_dir.join("Themes");
            let config_path = config_dir.join("settings.toml");
            let dict_path = config_dir.join("custom-spelling.dic");

            // One-time migration: move persistent data from old .local/share to .config
            for (old, new) in [
                (local_dir.join("settings.toml"), &config_path),
                (local_dir.join("custom-spelling.dic"), &dict_path),
                (local_dir.join("Database"), &db_dir),
                (local_dir.join("Themes"), &themes_dir),
            ] {
                if old.exists() && !new.exists() && let Err(e) = fs::rename(&old, new) {
                    log::warn!("Failed to migrate {:?} to {:?}: {}", old, new, e);
                }
            }

            for dir in [&local_dir, &config_dir, &db_dir, &log_dir, &themes_dir] {
                if let Err(e) = fs::create_dir_all(dir) {
                    log::warn!("Failed to create directory {:?}: {}", dir, e);
                }
            }

            // Cleanup stale temp files from previous crashes (older than 1 hour)
            // Run in background to avoid blocking startup
            let cleanup_local_dir = local_dir.clone();
            let cleanup_config_dir = config_dir.clone();
            tauri::async_runtime::spawn(async move {
                let one_hour = std::time::Duration::from_secs(3600);
                if let Err(e) = utils::cleanup_stale_temp_files(&cleanup_local_dir, one_hour).await {
                    log::warn!("Failed to cleanup temp files in local dir: {}", e);
                }
                if let Err(e) = utils::cleanup_stale_temp_files(&cleanup_config_dir, one_hour).await {
                    log::warn!("Failed to cleanup temp files in config dir: {}", e);
                }
            });

            println!("[INFO] Portable Mode: {}", is_portable);
            println!("[INFO] Config Directory: {:?}", config_dir);
            println!("[INFO] Cache Directory: {:?}", local_dir);

            // Write reference theme files in background to avoid blocking startup.
            // These serve as templates users can copy to create custom themes.
            let themes_dir_clone = themes_dir.clone();
            tauri::async_runtime::spawn(async move {
                let dark_theme_path = themes_dir_clone.join("default-dark.css");
                if let Err(e) = tokio::fs::write(&dark_theme_path, include_str!("../templates/default-dark.css")).await {
                    log::warn!("Failed to write dark theme reference: {}", e);
                }

                let light_theme_path = themes_dir_clone.join("default-light.css");
                if let Err(e) = tokio::fs::write(&light_theme_path, include_str!("../templates/default-light.css")).await {
                    log::warn!("Failed to write light theme reference: {}", e);
                }
            });

            // Robustly read settings from the TOML file
            let settings_level = if config_path.exists() {
                match fs::read(&config_path) {
                    Ok(raw_bytes) => {
                        let content = utils::read_text_with_bom_detection(raw_bytes);

                        match toml::from_str::<toml::Value>(&content) {
                            Ok(toml_val) => toml_val
                                .get("logLevel")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(default_log_level),
                            Err(e) => {
                                eprintln!("[WARN] Failed to parse settings.toml: {} - Using default log level", e);
                                default_log_level()
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[WARN] Failed to read settings.toml: {} - Using default log level", e);
                        default_log_level()
                    }
                }
            } else {
                default_log_level()
            };

            let log_level = match settings_level.as_str() {
                s if s.eq_ignore_ascii_case("error") => LevelFilter::Error,
                s if s.eq_ignore_ascii_case("warn") || s.eq_ignore_ascii_case("warning") => LevelFilter::Warn,
                s if s.eq_ignore_ascii_case("info") => LevelFilter::Info,
                s if s.eq_ignore_ascii_case("trace") => LevelFilter::Trace,
                s if s.eq_ignore_ascii_case("off") => LevelFilter::Off,
                _ => LevelFilter::Debug,
            };

            eprintln!(
                "[INFO] Initializing logger with level: {:?} (source: '{}')",
                log_level, settings_level
            );

            app_handle.plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .level_for("tao", LevelFilter::Error)
                    .level_for("wry", LevelFilter::Error)
                    .level_for("markdown_rs", log_level) // Explicitly set crate level
                    .max_file_size(10 * 1024 * 1024) // Log file rotation: max 10MB
                    .rotation_strategy(RotationStrategy::KeepOne)
                    .targets([
                        Target::new(TargetKind::Stdout),
                        Target::new(TargetKind::Folder {
                            path: log_dir.clone(),
                            file_name: Some("markdown-rs".into()),
                        }),
                        Target::new(TargetKind::Webview),
                    ])
                    .build(),
            )?;

            if !dict_path.exists() && let Err(e) = fs::write(&dict_path, "") {
                log::warn!("Failed to create custom dictionary file: {}", e);
            }

            let db_path = db_dir.join("session.db");

            // Database initialization with corruption recovery
            let db = match db::Database::new(db_path.clone()) {
                Ok(db) => db,
                Err(e) => {
                    log::error!("Failed to initialize database: {}", e);
                    log::warn!("Attempting database recovery...");

                    if db_path.exists() {
                        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
                        let backup_path = db_dir.join(format!("session.db.bak.{}", timestamp));

                        if let Err(io_err) = fs::rename(&db_path, &backup_path) {
                            log::error!("Failed to rename corrupted database: {}", io_err);
                            return Err(format!("Database corruption detected. Failed to backup: {}", io_err).into());
                        }
                        log::info!("Corrupted database moved to {:?}", backup_path);
                    }

                    // Retry initialization
                    db::Database::new(db_path).map_err(|retry_err| {
                        log::error!("Failed to initialize fresh database: {}", retry_err);
                        format!("Critical: Failed to create new database after corruption: {}", retry_err)
                    })?
                }
            };

            app.manage(state::AppState {
                db,
                speller: std::sync::Mutex::new(None),
                custom_dict: std::sync::Mutex::new(std::collections::HashSet::new()),
                spellcheck_status: std::sync::Mutex::new(state::SpellcheckStatus::Uninitialized),
                max_file_size_bytes: std::sync::atomic::AtomicU64::new(state::MAX_FILE_SIZE_UNSET),
                settings_cache: std::sync::Mutex::new(None),
            });

            // Check for command-line arguments on first launch.
            // Use args_os() to avoid panics on invalid Unicode (Windows), convert
            // lossily, and skip any flag-style arguments (e.g. --help).
            let args: Vec<String> = std::env::args_os()
                .skip(1)
                .filter(|a| !a.to_string_lossy().starts_with('-'))
                .map(|a| a.to_string_lossy().into_owned())
                .collect();
            if let Some(file_path) = args.into_iter().next() {
                let window_clone = window.clone();

                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                    let _ = window_clone.show();
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                    let _ = window_clone.set_focus();

                    // Give the frontend time to initialize before sending the file path
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                    log::info!("Opening file from initial launch: {}", file_path);
                    let _ = window_clone.emit("open-file-from-args", &file_path);
                });
            } else {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                    let _ = window.show();
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                    let _ = window.set_focus();
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::session::save_session,
            commands::session::restore_session,
            commands::session::load_tab_content,
            commands::session::vacuum_database,
            commands::files::read_text_file,
            commands::files::write_text_file,
            commands::files::write_binary_file,
            commands::files::get_file_metadata,
            commands::files::send_to_recycle_bin,
            commands::files::resolve_path_relative,
            commands::files::rename_file,
            commands::files::add_to_recent_files,
            commands::files::get_recent_files,
            commands::files::remove_from_recent_files,
            commands::files::clear_recent_files,
            commands::settings::get_app_info,
            commands::spellcheck::add_to_dictionary,
            commands::spellcheck::load_user_dictionary,
            commands::spellcheck::init_spellchecker,
            commands::spellcheck::check_words,
            commands::spellcheck::get_spelling_suggestions,
            commands::spellcheck::get_spellcheck_status,
            commands::markdown::render_markdown,
            commands::markdown::format_markdown,
            commands::markdown::get_markdown_flavors,
            commands::markdown::compute_text_metrics,
            commands::bookmarks::add_bookmark,
            commands::bookmarks::get_all_bookmarks,
            commands::bookmarks::delete_bookmark,
            commands::bookmarks::update_bookmark_access_time,
            commands::settings::get_available_themes,
            commands::settings::get_theme_css,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::set_context_menu_item,
            commands::settings::check_context_menu_status,
            commands::updater::check_for_updates,
            commands::updater::download_and_install_update,
            commands::settings::toggle_devtools,
            commands::export::export_to_pdf,
            commands::data::export_bookmarks,
            commands::data::import_bookmarks,
            commands::data::export_recent_files,
            commands::data::import_recent_files,
            commands::data::delete_orphan_files,
            commands::window::set_window_title,
        ])
        .run(tauri::generate_context!())
        .map_err(|e| {
            log::error!("Error while running tauri application: {}", e);
            e
        })
        .expect("Error while running tauri application");
}
