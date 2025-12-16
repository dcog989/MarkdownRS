// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_commands;
mod db;

use log::{LevelFilter, info};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

#[derive(Debug, Serialize, Deserialize)]
struct AppSettings {
    log_level: String,
    tab_width_min: u32,
    tab_width_max: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            log_level: "debug".to_string(),
            tab_width_min: 140,
            tab_width_max: 220,
        }
    }
}

fn main() {
    // Fix for Windows MPO (Multi-Plane Overlay) causing flickering/white artifacts
    // when the window is in the top half of the screen.
    #[cfg(target_os = "windows")]
    unsafe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-features=CalculateNativeWinOcclusion --disable-direct-composition",
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When a second instance is launched, focus the existing window
            let windows = app.webview_windows();
            if let Some((_, window)) = windows.iter().next() {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle();
            let window = app.get_webview_window("main").unwrap();

            // 1. Resolve Paths
            // Use data_dir() (AppData/Roaming) and explicitly append "MarkdownRS"
            // instead of app_data_dir() which uses the bundle identifier.
            let base_dir = app_handle
                .path()
                .data_dir()
                .expect("failed to get data dir");

            let app_dir = base_dir.join("MarkdownRS");
            let db_dir = app_dir.join("Database");
            let log_dir = app_dir.join("Logs");
            let config_path = app_dir.join("settings.toml");
            let dict_path = app_dir.join("custom-spelling.dic");

            // 2. Create Directories
            fs::create_dir_all(&app_dir).expect("failed to create app dir");
            fs::create_dir_all(&db_dir).expect("failed to create db dir");
            fs::create_dir_all(&log_dir).expect("failed to create log dir");

            // 3. Load/Create Settings.toml
            let settings: AppSettings = if config_path.exists() {
                let content = fs::read_to_string(&config_path).unwrap_or_default();
                toml::from_str(&content).unwrap_or_default()
            } else {
                let defaults = AppSettings::default();
                let toml_string = toml::to_string(&defaults).unwrap_or_default();
                let _ = fs::write(&config_path, toml_string);
                defaults
            };

            // Create empty dictionary file if not exists
            if !dict_path.exists() {
                let _ = fs::write(&dict_path, "");
            }

            let log_level = match settings.log_level.to_lowercase().as_str() {
                "error" => LevelFilter::Error,
                "warn" => LevelFilter::Warn,
                "info" => LevelFilter::Info,
                "trace" => LevelFilter::Trace,
                "off" => LevelFilter::Off,
                _ => LevelFilter::Debug,
            };

            // 4. Initialize Logging Plugin
            app_handle.plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .level_for("tao", LevelFilter::Error)
                    .level_for("wry", LevelFilter::Error)
                    .level_for("move_resize", LevelFilter::Error)
                    .max_file_size(10 * 1024 * 1024) // 10MB
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

            info!("Application started. Logs writing to: {:?}", log_dir);

            // 5. Initialize DB
            let db_path = db_dir.join("session.db");
            let db = db::Database::new(db_path).expect("failed to initialize database");

            app.manage(app_commands::AppState {
                db: std::sync::Mutex::new(db),
            });

            // 6. Async Show & Focus (Prevents Flash + Ghost Focus)
            tauri::async_runtime::spawn(async move {
                // Wait for window-state to restore position
                std::thread::sleep(std::time::Duration::from_millis(150));

                if let Err(e) = window.show() {
                    log::error!("Failed to show window: {}", e);
                }

                // Buffer for OS visibility
                std::thread::sleep(std::time::Duration::from_millis(50));

                if let Err(e) = window.set_focus() {
                    log::error!("Failed to set focus: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_commands::save_session,
            app_commands::restore_session,
            app_commands::read_text_file,
            app_commands::write_text_file,
            app_commands::get_file_metadata,
            app_commands::get_app_info,
            app_commands::send_to_recycle_bin,
            app_commands::add_to_dictionary,
            app_commands::get_custom_dictionary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
