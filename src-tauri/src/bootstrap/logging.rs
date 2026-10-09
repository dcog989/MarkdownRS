use crate::bootstrap::paths::AppPaths;
use crate::utils;
use flexi_logger::{
    AdaptiveFormat, Age, Cleanup, Criterion, DeferredNow, Duplicate, FileSpec, LogSpecification, Logger, LoggerHandle,
    Naming, TS_DASHES_BLANK_COLONS_DOT_BLANK, style,
};
use log::{LevelFilter, Record};
use std::sync::OnceLock;

const KEPT_LOG_FILES: usize = 9;
const LOG_FILE_BASENAME: &str = "markdown-rs";
const LOG_FILE_SUFFIX: &str = "log";
const LOG_DATE_FORMAT: &str = "%Y-%m-%d";
const DEFAULT_LOG_LEVEL: &str = "info";

static LOGGER_HANDLE: OnceLock<LoggerHandle> = OnceLock::new();

fn default_log_level() -> String {
    DEFAULT_LOG_LEVEL.to_string()
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
        s if s.eq_ignore_ascii_case("warn") || s.eq_ignore_ascii_case("warning") => LevelFilter::Warn,
        s if s.eq_ignore_ascii_case("info") => LevelFilter::Info,
        s if s.eq_ignore_ascii_case("debug") => LevelFilter::Debug,
        s if s.eq_ignore_ascii_case("trace") => LevelFilter::Trace,
        s if s.eq_ignore_ascii_case("off") => LevelFilter::Off,
        _ => LevelFilter::Info,
    }
}

fn build_log_spec(level: &str) -> LogSpecification {
    let mut builder = LogSpecification::builder();
    builder
        .default(parse_log_level(level))
        .module("tao", LevelFilter::Error)
        .module("wry", LevelFilter::Error);
    builder.build()
}

fn timestamped_format(
    w: &mut dyn std::io::Write,
    now: &mut DeferredNow,
    record: &Record,
) -> Result<(), std::io::Error> {
    write!(
        w,
        "[{}] {} [{}] {}",
        now.format(TS_DASHES_BLANK_COLONS_DOT_BLANK),
        record.level(),
        record.module_path().unwrap_or("<unnamed>"),
        record.args(),
    )
}

fn timestamped_colored_format(
    w: &mut dyn std::io::Write,
    now: &mut DeferredNow,
    record: &Record,
) -> Result<(), std::io::Error> {
    let level = record.level();
    write!(
        w,
        "[{}] {} [{}] {}",
        style(level).paint(now.format(TS_DASHES_BLANK_COLONS_DOT_BLANK).to_string()),
        style(level).paint(level.to_string()),
        record.module_path().unwrap_or("<unnamed>"),
        style(level).paint(record.args().to_string()),
    )
}

pub fn init(config_path: &std::path::Path, log_dir: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    let settings_level = read_log_level_from_settings(config_path);

    eprintln!(
        "[INFO] Initializing logger with level: {:?} (source: '{}')",
        parse_log_level(&settings_level),
        settings_level
    );

    let file_spec = FileSpec::default()
        .directory(log_dir)
        .basename(LOG_FILE_BASENAME)
        .suffix(LOG_FILE_SUFFIX);

    let handle = Logger::with(build_log_spec(&settings_level))
        .log_to_file(file_spec)
        .duplicate_to_stdout(Duplicate::All)
        .format_for_files(timestamped_format)
        .adaptive_format_for_stdout(AdaptiveFormat::Custom(timestamped_format, timestamped_colored_format))
        .adaptive_format_for_stderr(AdaptiveFormat::Custom(timestamped_format, timestamped_colored_format))
        .rotate(
            Criterion::Age(Age::Day),
            Naming::TimestampsCustomFormat {
                current_infix: Some(""),
                format: LOG_DATE_FORMAT,
            },
            Cleanup::KeepLogFiles(KEPT_LOG_FILES),
        )
        .append()
        .start()?;

    let _ = LOGGER_HANDLE.set(handle);

    Ok(())
}

/// Applies a new effective log level at runtime. The spec is rebuilt with the
/// same `tao`/`wry` caps and handed to the running logger.
pub fn apply_log_level(level: &str) {
    if let Some(handle) = LOGGER_HANDLE.get() {
        handle.set_new_spec(build_log_spec(level));
    }
}

pub fn log_runtime_info(paths: &AppPaths) {
    log::info!("Portable Mode: {}", crate::portable::is_portable_mode());
    log::info!("Data Directory: {:?}", paths.local_dir);
    log::info!("Config Directory: {:?}", paths.config_dir);
    log::info!("Cache Directory: {:?}", paths.cache_dir);
}
