use std::path::PathBuf;
use std::sync::OnceLock;

#[derive(Debug)]
pub struct PortableConfig {
    is_portable: bool,
    data_dir: Option<PathBuf>,
}

impl PortableConfig {
    pub fn is_portable(&self) -> bool {
        self.is_portable
    }

    pub fn data_dir(&self) -> Option<&PathBuf> {
        self.data_dir.as_ref()
    }
}

static PORTABLE_CONFIG: OnceLock<PortableConfig> = OnceLock::new();

pub fn is_portable_mode() -> bool {
    PORTABLE_CONFIG.get().is_some_and(|c| c.is_portable)
}

/// Directory portable mode treats as the application's install location.
///
/// An AppImage runs from a temporary squashfs mount (`/tmp/.mount_*`), so
/// `current_exe()` does not point at the file the user installed. The AppImage
/// runtime exposes its real path through the `APPIMAGE` environment variable.
fn install_dir() -> Option<PathBuf> {
    if let Some(appimage) = std::env::var_os("APPIMAGE") {
        let appimage = PathBuf::from(appimage);
        if appimage.is_file() {
            return appimage.parent().map(PathBuf::from);
        }
    }
    std::env::current_exe().ok()?.parent().map(PathBuf::from)
}

pub fn detect_portable_mode() -> PortableConfig {
    let Some(install_dir) = install_dir() else {
        eprintln!("[WARN] Could not determine install directory — portable mode disabled");
        return PortableConfig {
            is_portable: false,
            data_dir: None,
        };
    };
    let portable_marker = install_dir.join(".portable");

    if portable_marker.exists() {
        PortableConfig {
            is_portable: true,
            data_dir: Some(install_dir.join("Data")),
        }
    } else {
        PortableConfig {
            is_portable: false,
            data_dir: None,
        }
    }
}

pub fn init_portable_config(config: PortableConfig) {
    PORTABLE_CONFIG
        .set(config)
        .expect("PORTABLE_CONFIG set called more than once");
}
