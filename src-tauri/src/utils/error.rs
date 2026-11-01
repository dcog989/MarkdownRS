/// Stable code for a file the UI must not open as text, so the toast can be
/// translated instead of showing a raw English message.
pub const BINARY_FILE_ERROR: &str = "BINARY_FILE";

pub trait IntoTauriError<T> {
    fn to_tauri_result(self) -> Result<T, String>;
}

impl<T> IntoTauriError<T> for Result<T, anyhow::Error> {
    fn to_tauri_result(self) -> Result<T, String> {
        self.map_err(|e| {
            log::error!("{}", e);
            e.to_string()
        })
    }
}

fn format_error(context: Option<&str>, operation: &str, e: impl std::fmt::Display) -> String {
    match context {
        Some(c) => format!("Failed to {} '{}': {}", operation, c, e),
        None => format!("Failed to {}: {}", operation, e),
    }
}

pub fn handle_error(context: Option<&str>, operation: &str, e: impl std::fmt::Display) -> String {
    let msg = format_error(context, operation, e);
    log::error!("{}", msg);
    msg
}

/// Like `handle_error`, but prefixes a stable code for the failures the UI
/// translates. OS error text is localized, so the frontend cannot match it.
pub fn handle_io_error(context: Option<&str>, operation: &str, e: std::io::Error) -> String {
    let code = match e.kind() {
        std::io::ErrorKind::NotFound => "NOT_FOUND: ",
        std::io::ErrorKind::PermissionDenied => "PERMISSION_DENIED: ",
        _ => "",
    };
    let msg = format_error(context, operation, e);
    log::error!("{}{}", code, msg);
    format!("{}{}", code, msg)
}
