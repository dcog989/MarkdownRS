// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use simplelog::*;
use std::fs::{self, File};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle();

            // Resolve AppData/Roaming directory
            // On Windows: C:\Users\User\AppData\Roaming
            let base_dir = app_handle
                .path()
                .data_dir()
                .expect("failed to get data dir");

            let app_dir = base_dir.join("MarkdownRS");
            let log_dir = app_dir.join("Logs");
            let db_dir = app_dir.join("Database");

            // Create directories
            fs::create_dir_all(&log_dir).expect("failed to create log dir");
            fs::create_dir_all(&db_dir).expect("failed to create db dir");

            // Initialize Logging to Roaming/MarkdownRS/Logs
            let _ = WriteLogger::init(
                LevelFilter::Info,
                Config::default(),
                File::create(log_dir.join("markdown-rs.log"))
                    .unwrap_or_else(|_| File::create("markdown-rs-fallback.log").unwrap()),
            );

            // Initialize DB to Roaming/MarkdownRS/Database
            let db_path = db_dir.join("session.db");
            let db = db::Database::new(db_path).expect("failed to initialize database");

            app.manage(commands::AppState {
                db: std::sync::Mutex::new(db),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_session,
            commands::restore_session,
            commands::read_text_file,
            commands::write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
