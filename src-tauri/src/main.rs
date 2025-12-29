// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_commands;
mod db;
mod markdown_config;
mod markdown_formatter;
mod markdown_renderer;
mod text_transforms;

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

                // Handle file path argument from Windows Explorer
                if args.len() > 1 {
                    // args[0] is the executable path, args[1] is the file path
                    let file_path = &args[1];
                    log::info!("Opening file from command line: {}", file_path);

                    // Emit event to frontend with the file path
                    let _ = window.emit("open-file-from-args", file_path);
                }
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
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
            let window = app.get_webview_window("main").unwrap();

            // Roaming Data (Settings, Session DB, Custom Dictionary)
            let app_dir = app_handle
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");

            // Local Data (Logs, Spellcheck Cache)
            let local_dir = app_handle
                .path()
                .app_local_data_dir()
                .expect("failed to get app local data dir");

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
            let db = db::Database::new(db_path).expect("failed to initialize database");

            app.manage(app_commands::AppState {
                db: tokio::sync::Mutex::new(db),
                speller: std::sync::Arc::new(tokio::sync::Mutex::new(None)),
                custom_dict: std::sync::Arc::new(tokio::sync::Mutex::new(
                    std::collections::HashSet::new(),
                )),
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
            app_commands::save_session,
            app_commands::restore_session,
            app_commands::vacuum_database,
            app_commands::read_text_file,
            app_commands::write_text_file,
            app_commands::write_binary_file,
            app_commands::get_file_metadata,
            app_commands::get_app_info,
            app_commands::send_to_recycle_bin,
            app_commands::add_to_dictionary,
            app_commands::get_custom_dictionary,
            app_commands::resolve_path_relative,
            app_commands::init_spellchecker,
            app_commands::check_words,
            app_commands::get_spelling_suggestions,
            app_commands::transform_text_content,
            app_commands::add_bookmark,
            app_commands::get_all_bookmarks,
            app_commands::delete_bookmark,
            app_commands::update_bookmark_access_time,
            app_commands::get_available_themes,
            app_commands::get_theme_css,
            app_commands::render_markdown,
            app_commands::format_markdown,
            app_commands::get_markdown_flavors,
            app_commands::load_settings,
            app_commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
