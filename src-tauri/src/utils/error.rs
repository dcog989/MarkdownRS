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

pub fn handle_error(context: Option<&str>, operation: &str, e: impl std::fmt::Display) -> String {
    let msg = match context {
        Some(c) => format!("Failed to {} '{}': {}", operation, c, e),
        None => format!("Failed to {}: {}", operation, e),
    };
    log::error!("{}", msg);
    msg
}
