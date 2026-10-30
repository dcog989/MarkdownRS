//! Linux desktop registration for the AppImage build.
//!
//! An AppImage has no installer, so the menu entry, icon and MIME types are
//! written on launch. Release filenames carry the version, so `Exec` is
//! repointed whenever it no longer matches the running file.

use crate::portable;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const DESKTOP_FILE_NAME: &str = "markdownrs.desktop";
const ICON_NAME: &str = "markdownrs";
const ICON_PNG: &[u8] = include_bytes!("../../icons/256x256.png");
const MIME_TYPES: &str = "text/markdown;text/plain;";
const EXEC_RESERVED: &[char] = &[
    '"', '\'', '\\', '>', '<', '~', '|', '&', ';', '$', '*', '?', '#', '(', ')', '`', ' ',
];

/// Registers the AppImage off the startup path: the icon compare, desktop-file
/// write and `update-desktop-database` spawn are filesystem/process work that
/// nothing waits for.
pub fn install_appimage_integration() {
    tauri::async_runtime::spawn_blocking(register_appimage_integration);
}

fn register_appimage_integration() {
    if portable::is_portable_mode() {
        return;
    }
    let Some(appimage) = std::env::var_os("APPIMAGE").map(PathBuf::from) else {
        return;
    };
    if !appimage.is_file() {
        return;
    }
    let Some(data_dir) = data_dir() else {
        log::warn!("Cannot register desktop entry: no data directory");
        return;
    };
    if let Err(e) = install(&appimage, &data_dir) {
        log::warn!("Failed to register desktop entry: {}", e);
    }
}

fn data_dir() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(dirs::data_dir)
}

fn install(appimage: &Path, data_dir: &Path) -> std::io::Result<()> {
    let applications_dir = data_dir.join("applications");
    let icon_dir = data_dir.join("icons/hicolor/256x256/apps");
    fs::create_dir_all(&applications_dir)?;
    fs::create_dir_all(&icon_dir)?;

    let icon_path = icon_dir.join(format!("{}.png", ICON_NAME));
    if fs::read(&icon_path).ok().as_deref() != Some(ICON_PNG) {
        fs::write(&icon_path, ICON_PNG)?;
    }

    let desktop_path = applications_dir.join(DESKTOP_FILE_NAME);
    if !has_current_exec(&desktop_path, appimage) {
        fs::write(&desktop_path, desktop_entry(appimage))?;
        // Builds the menu and MIME caches; absent on minimal systems.
        let _ = Command::new("update-desktop-database").arg(&applications_dir).status();
        log::info!("Registered AppImage in the application menu: {}", appimage.display());
    }
    Ok(())
}

fn has_current_exec(desktop_path: &Path, appimage: &Path) -> bool {
    let exec_line = exec_line(appimage);
    fs::read_to_string(desktop_path)
        .map(|content| content.lines().any(|line| line == exec_line))
        .unwrap_or(false)
}

fn exec_line(appimage: &Path) -> String {
    format!("Exec={} %U", quote_exec(&appimage.to_string_lossy()))
}

fn desktop_entry(appimage: &Path) -> String {
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=MarkdownRS\n\
         Comment=Markdown editor\n\
         {}\n\
         Icon={}\n\
         Terminal=false\n\
         Categories=Utility;TextEditor;\n\
         MimeType={}\n",
        exec_line(appimage),
        ICON_NAME,
        MIME_TYPES
    )
}

fn quote_exec(path: &str) -> String {
    if !path.contains(EXEC_RESERVED) {
        return path.to_string();
    }
    let escaped = path
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
        .replace('`', "\\`");
    format!("\"{}\"", escaped)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_paths_are_not_quoted() {
        assert_eq!(
            quote_exec("/home/user/Apps/MarkdownRS.AppImage"),
            "/home/user/Apps/MarkdownRS.AppImage"
        );
    }

    #[test]
    fn paths_with_spaces_are_quoted_and_escaped() {
        assert_eq!(
            quote_exec("/home/user/My Apps/$new.AppImage"),
            "\"/home/user/My Apps/\\$new.AppImage\""
        );
    }

    #[test]
    fn desktop_entry_points_at_running_file() {
        let entry = desktop_entry(Path::new("/opt/MarkdownRS_1.0.0.AppImage"));
        assert!(entry.contains("Exec=/opt/MarkdownRS_1.0.0.AppImage %U\n"), "{}", entry);
        assert!(entry.contains("Icon=markdownrs\n"), "{}", entry);
        assert!(entry.contains("MimeType=text/markdown;text/plain;\n"), "{}", entry);
    }
}
