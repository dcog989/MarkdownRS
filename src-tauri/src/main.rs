// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod markdown;
mod state;
mod utils;

use log::LevelFilter;
use std::fs;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use unicode_bom::Bom;

fn default_log_level() -> String {
    "info".to_string()
}

fn main() {
    #[cfg(target_os = "windows")]
    unsafe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-features=CalculateNativeWinOcclusion --disable-direct-composition",
        );
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
        .plugin(tauri_plugin_updater::Builder::new().build())
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

            // Roaming Data (Settings, Session DB, Custom Dictionary)
            let app_dir = app_handle
                .path()
                .app_data_dir()
                .map_err(|e| {
                    log::error!("Failed to get app data dir: {}", e);
                    format!("Failed to get app data dir: {}", e)
                })?;

            // Local Data (Logs, Spellcheck Cache)
            let local_dir = app_handle
                .path()
                .app_local_data_dir()
                .map_err(|e| {
                    log::error!("Failed to get local data dir: {}", e);
                    format!("Failed to get local data dir: {}", e)
                })?;

            let db_dir = app_dir.join("Database");
            let log_dir = local_dir.join("Logs");
            let themes_dir = app_dir.join("Themes");
            let config_path = app_dir.join("settings.toml");
            let dict_path = app_dir.join("custom-spelling.dic");

            let _ = fs::create_dir_all(&app_dir);
            let _ = fs::create_dir_all(&local_dir);
            let _ = fs::create_dir_all(&db_dir);
            let _ = fs::create_dir_all(&log_dir);
            let _ = fs::create_dir_all(&themes_dir);

            println!("[INFO] Data Directory: {:?}", app_dir);
            println!("[INFO] Log Directory: {:?}", log_dir);

            // Always overwrite default theme files to ensure updates are applied
            let dark_theme_path = themes_dir.join("default-dark.css");
            let dark_theme_content = include_str!("../templates/default-dark.css");
            let _ = fs::write(&dark_theme_path, dark_theme_content);

            let light_theme_path = themes_dir.join("default-light.css");
            let light_theme_content = include_str!("../templates/default-light.css");
            let _ = fs::write(&light_theme_path, light_theme_content);

            // Robustly read settings from the TOML file
            let settings_level = if config_path.exists() {
                match fs::read(&config_path) {
                    Ok(raw_bytes) => {
                        // Strip BOM using unicode-bom crate for robust handling
                        let content = match Bom::from(raw_bytes.as_slice()) {
                            Bom::Null => {
                                // No BOM detected, decode as UTF-8
                                String::from_utf8_lossy(&raw_bytes).to_string()
                            }
                            bom => {
                                // BOM detected, strip it and decode the rest
                                let without_bom = &raw_bytes[bom.len()..];
                                String::from_utf8_lossy(without_bom).to_string()
                            }
                        };

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

            let log_level = match settings_level.to_lowercase().as_str() {
                "error" => LevelFilter::Error,
                "warn" | "warning" => LevelFilter::Warn,
                "info" => LevelFilter::Info,
                "trace" => LevelFilter::Trace,
                "off" => LevelFilter::Off,
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
                    .max_file_size(10 * 1024 * 1024)
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

            if !dict_path.exists() {
                let _ = fs::write(&dict_path, "");
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
                db: tokio::sync::Mutex::new(db),
                speller: tokio::sync::Mutex::new(None),
                custom_dict: tokio::sync::Mutex::new(std::collections::HashSet::new()),
            });

            // Check for command-line arguments on first launch
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                // args[0] is the executable path, args[1] is the file path
                let file_path = args[1].clone();
                let window_clone = window.clone();

                tauri::async_runtime::spawn(async move {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    let _ = window_clone.show();
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    let _ = window_clone.set_focus();

                    // Give the frontend time to initialize before sending the file path
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    log::info!("Opening file from initial launch: {}", file_path);
                    let _ = window_clone.emit("open-file-from-args", &file_path);
                });
            } else {
                tauri::async_runtime::spawn(async move {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    let _ = window.show();
                    std::thread::sleep(std::time::Duration::from_millis(50));
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
            commands::settings::get_app_info,
            commands::spellcheck::add_to_dictionary,
            commands::spellcheck::load_user_dictionary,
            commands::spellcheck::init_spellchecker,
            commands::spellcheck::check_words,
            commands::spellcheck::get_spelling_suggestions,
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
        ])
        .run(tauri::generate_context!())
        .map_err(|e| {
            log::error!("Error while running tauri application: {}", e);
            e
        }).expect("Error while running tauri application");
}
