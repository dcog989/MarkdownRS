use crate::utils::{handle_error, read_text_with_bom_detection};

pub fn parse_settings_toml(content: &str) -> Result<toml::Value, String> {
    toml::from_str(content).map_err(|e| handle_error(None, "parse settings TOML", e))
}

pub fn read_settings_toml(path: &std::path::Path) -> Result<toml::Value, String> {
    let raw_bytes = std::fs::read(path)
        .map_err(|e| handle_error(Some(&path.to_string_lossy()), "read settings file", e))?;
    let content = read_text_with_bom_detection(raw_bytes);
    parse_settings_toml(&content)
}
