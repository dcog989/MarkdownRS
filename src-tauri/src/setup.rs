use crate::migration;
use crate::portable;
use crate::state;
use crate::utils;
use log::LevelFilter;
use std::fs;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

fn default_log_level() -> String {
    "info".to_string()
}

#[cfg(target_os = "linux")]
fn configure_linux_window(window: &tauri::WebviewWindow) {
    use gtk::prelude::GtkWindowExt;

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
}

#[cfg(not(target_os = "linux"))]
fn configure_linux_window(_window: &tauri::WebviewWindow) {}

fn read_log_level_from_settings(config_path: &std::path::Path) -> String {
    if config_path.exists() {
        match fs::read(config_path) {
            Ok(raw_bytes) => {
                let content = utils::read_text_with_bom_detection(raw_bytes);
                match toml::from_str::<toml::Value>(&content) {
                    Ok(toml_val) => toml_val
                        .get("logLevel")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(default_log_level),
                    Err(e) => {
                        eprintln!(
                            "[WARN] Failed to parse settings.toml: {} - Using default log level",
                            e
                        );
                        default_log_level()
                    },
                }
            },
            Err(e) => {
                eprintln!(
                    "[WARN] Failed to read settings.toml: {} - Using default log level",
                    e
                );
                default_log_level()
            },
        }
    } else {
        default_log_level()
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

fn handle_cli_args(window: tauri::WebviewWindow) {
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
}

pub fn run(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let window = app
        .get_webview_window("main")
        .ok_or("Failed to get main window")?;

    configure_linux_window(&window);

    let local_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get local data dir: {}", e))?;

    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;

    let db_dir = config_dir.join("Database");
    let log_dir = local_dir.join("Logs");
    let themes_dir = config_dir.join("Themes");
    let config_path = config_dir.join("settings.toml");
    let dict_path = config_dir.join("custom-spelling.dic");

    migration::migrate_to_config(&local_dir, &config_dir);

    for dir in [&local_dir, &config_dir, &db_dir, &log_dir, &themes_dir] {
        if let Err(e) = fs::create_dir_all(dir) {
            log::warn!("Failed to create directory {:?}: {}", dir, e);
        }
    }

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

    log::info!("Portable Mode: {}", portable::is_portable_mode());
    log::info!("Config Directory: {:?}", config_dir);
    log::info!("Cache Directory: {:?}", local_dir);

    let themes_dir_clone = themes_dir.clone();
    tauri::async_runtime::spawn(async move {
        let dark_theme_path = themes_dir_clone.join("RS-Dark.css");
        if let Err(e) = tokio::fs::write(
            &dark_theme_path,
            include_str!("../templates/default-dark.css"),
        )
        .await
        {
            log::warn!("Failed to write dark theme reference: {}", e);
        }

        let light_theme_path = themes_dir_clone.join("RS-Light.css");
        if let Err(e) = tokio::fs::write(
            &light_theme_path,
            include_str!("../templates/default-light.css"),
        )
        .await
        {
            log::warn!("Failed to write light theme reference: {}", e);
        }
    });

    let settings_level = read_log_level_from_settings(&config_path);
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
                    path: log_dir.clone(),
                    file_name: Some("markdown-rs".into()),
                }),
                Target::new(TargetKind::Webview),
            ])
            .build(),
    )?;

    if !dict_path.exists()
        && let Err(e) = fs::write(&dict_path, "")
    {
        log::warn!("Failed to create custom dictionary file: {}", e);
    }

    let db_path = db_dir.join("session.db");
    let db = init_database(db_path, &db_dir)?;

    app.manage(state::AppState {
        db,
        speller: std::sync::Arc::new(std::sync::Mutex::new(None)),
        custom_dict: std::sync::Mutex::new(std::collections::HashSet::new()),
        spellcheck_status: std::sync::Mutex::new(state::SpellcheckStatus::Uninitialized),
        max_file_size_bytes: std::sync::atomic::AtomicU64::new(state::MAX_FILE_SIZE_UNSET),
        settings_cache: std::sync::Mutex::new(None),
        project_root: std::sync::Mutex::new(None),
    });

    handle_cli_args(window);

    Ok(())
}
