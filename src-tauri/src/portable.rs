use std::sync::OnceLock;

#[derive(Debug)]
pub struct PortableConfig {
    is_portable: bool,
    data_dir: Option<std::path::PathBuf>,
}

impl PortableConfig {
    pub fn is_portable(&self) -> bool {
        self.is_portable
    }

    pub fn data_dir(&self) -> Option<&std::path::PathBuf> {
        self.data_dir.as_ref()
    }
}

static PORTABLE_CONFIG: OnceLock<PortableConfig> = OnceLock::new();

pub fn is_portable_mode() -> bool {
    PORTABLE_CONFIG.get().is_some_and(|c| c.is_portable)
}

#[allow(dead_code)]
pub fn portable_data_dir() -> Option<&'static std::path::PathBuf> {
    PORTABLE_CONFIG.get().and_then(|c| c.data_dir())
}

pub fn detect_portable_mode() -> PortableConfig {
    let exe_path = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!(
                "[WARN] Could not determine executable path: {} — portable mode disabled",
                e
            );
            return PortableConfig {
                is_portable: false,
                data_dir: None,
            };
        },
    };
    let exe_dir = match exe_path.parent() {
        Some(d) => d,
        None => {
            eprintln!("[WARN] Executable has no parent directory — portable mode disabled");
            return PortableConfig {
                is_portable: false,
                data_dir: None,
            };
        },
    };
    let portable_marker = exe_dir.join(".portable");

    if portable_marker.exists() {
        let portable_data_dir = exe_dir.join("Data");
        PortableConfig {
            is_portable: true,
            data_dir: Some(portable_data_dir),
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
