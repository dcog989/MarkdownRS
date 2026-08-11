use crate::bootstrap::paths::AppPaths;
use crate::utils;
use log::LevelFilter;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

fn default_log_level() -> String {
    "info".to_string()
}

fn read_log_level_from_settings(config_path: &std::path::Path) -> String {
    match utils::read_settings_toml(config_path) {
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

pub fn init(
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
            // Permissive dispatch so the effective level can be raised/lowered
            // at runtime via `log::set_max_level`; the global gate is restored
            // to the configured level right after registration.
            .level(LevelFilter::Trace)
            .level_for("tao", LevelFilter::Error)
            .level_for("wry", LevelFilter::Error)
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

    log::set_max_level(log_level);

    Ok(())
}

/// Applies a new effective log level at runtime. The plugin's dispatch filter
/// is permissive (Trace), so the global `log::set_max_level` gate fully
/// controls what is emitted; `tao`/`wry` stay capped at error by their
/// per-target filters.
pub fn apply_log_level(level: &str) {
    log::set_max_level(parse_log_level(level));
}

pub fn log_runtime_info(paths: &AppPaths) {
    log::info!("Portable Mode: {}", crate::portable::is_portable_mode());
    log::info!("Config Directory: {:?}", paths.config_dir);
    log::info!("Cache Directory: {:?}", paths.local_dir);
}
