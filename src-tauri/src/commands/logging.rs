use log::Level;

#[tauri::command]
pub async fn log_frontend(level: String, message: String) {
    let level = match level.to_ascii_lowercase().as_str() {
        "trace" => Level::Trace,
        "debug" => Level::Debug,
        "info" => Level::Info,
        "warn" | "warning" => Level::Warn,
        "error" => Level::Error,
        _ => Level::Info,
    };

    log::log!(target: "frontend", level, "{}", message);
}
