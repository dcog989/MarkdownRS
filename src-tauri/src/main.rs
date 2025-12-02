// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use simplelog::*;
use std::fs::{self, File};
use tauri::Manager;

fn main() {
    // Initialize logging
    let _ = WriteLogger::init(
        LevelFilter::Info,
        Config::default(),
        File::create("markdown-rs.log")
            .unwrap_or_else(|_| File::create("markdown-rs-fallback.log").unwrap()),
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle();
            let app_dir = app_handle
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");

            // Ensure app data dir exists
            if !app_dir.exists() {
                fs::create_dir_all(&app_dir).expect("failed to create app data dir");
            }

            let db_path = app_dir.join("session.db");
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
