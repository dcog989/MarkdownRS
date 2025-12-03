// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_commands;
mod db;

use chrono::Local;
use log::{LevelFilter, info, warn};
use serde::{Deserialize, Serialize};
use simplelog::*;
use std::fs::{self, File};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
struct AppSettings {
    log_level: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            log_level: "debug".to_string(),
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        // Initialize Window State Plugin
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let app_handle = app.handle();

            // 1. Resolve Paths
            let base_dir = app_handle
                .path()
                .data_dir()
                .expect("failed to get data dir");
            let app_dir = base_dir.join("MarkdownRS");
            let log_dir = app_dir.join("Logs");
            let db_dir = app_dir.join("Database");
            let config_path = app_dir.join("settings.toml");

            // 2. Create Directories
            fs::create_dir_all(&log_dir).expect("failed to create log dir");
            fs::create_dir_all(&db_dir).expect("failed to create db dir");

            // 3. Log Rotation
            let log_file_path = log_dir.join("markdown-rs.log");
            if log_file_path.exists() {
                let timestamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
                let archive_path = log_dir.join(format!("markdown-rs-{}.log", timestamp));
                if let Err(e) = fs::rename(&log_file_path, &archive_path) {
                    eprintln!("Failed to rotate log file: {}", e);
                }
            }

            // 4. Load/Create Settings.toml
            let settings: AppSettings = if config_path.exists() {
                let content = fs::read_to_string(&config_path).unwrap_or_default();
                toml::from_str(&content).unwrap_or_default()
            } else {
                let defaults = AppSettings::default();
                let toml_string = toml::to_string(&defaults).unwrap_or_default();
                let _ = fs::write(&config_path, toml_string);
                defaults
            };

            // 5. Initialize Logger
            let log_level = match settings.log_level.to_lowercase().as_str() {
                "error" => LevelFilter::Error,
                "warn" => LevelFilter::Warn,
                "info" => LevelFilter::Info,
                "trace" => LevelFilter::Trace,
                "off" => LevelFilter::Off,
                _ => LevelFilter::Debug,
            };

            let _ = WriteLogger::init(
                log_level,
                Config::default(),
                File::create(&log_file_path).expect("failed to create log file"),
            );

            info!("Application started. Log Level: {:?}", log_level);

            // 6. Initialize DB
            let db_path = db_dir.join("session.db");
            let db = db::Database::new(db_path).expect("failed to initialize database");

            app.manage(app_commands::AppState {
                db: std::sync::Mutex::new(db),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_commands::save_session,
            app_commands::restore_session,
            app_commands::read_text_file,
            app_commands::write_text_file,
            app_commands::get_file_metadata,
            app_commands::log_frontend
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
