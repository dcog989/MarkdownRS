use comrak::Options;
use comrak::options::{Extension, Parse, Render};
use rumdl_lib::config::{Config, ConfigLoaded, SourcedConfig};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Markdown flavor specification (for comrak rendering)
#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    Hash,
    Default
)]
#[serde(rename_all = "lowercase")]
pub enum MarkdownFlavor {
    /// Pure CommonMark (no extensions)
    CommonMark,
    /// GitHub Flavored Markdown (full GFM spec)
    #[default]
    Gfm,
}

impl MarkdownFlavor {
    /// Convert string to MarkdownFlavor
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "commonmark" => Some(Self::CommonMark),
            "gfm" | "github" => Some(Self::Gfm),
            _ => None,
        }
    }

    /// Parse flavor from an optional string, returning default if None or invalid
    pub fn from_option_str(flavor: Option<String>) -> Self {
        flavor.and_then(|f| Self::from_str(&f)).unwrap_or_default()
    }

    /// Get central comrak options for this flavor
    pub fn to_comrak_options(self) -> Options<'static> {
        let mut options = Options {
            extension: match self {
                Self::CommonMark => Extension::default(),
                Self::Gfm => Extension {
                    strikethrough: true,
                    tagfilter: true,
                    table: true,
                    autolink: true,
                    tasklist: true,
                    subscript: true,
                    ..Default::default()
                },
            },
            parse: Parse {
                smart: true,
                default_info_string: None,
                ..Default::default()
            },
            render: Render {
                r#unsafe: false,
                escape: false,
                sourcepos: true,
                ..Default::default()
            },
        };
        options.extension.header_id_prefix = Some(String::new());
        options
    }
}

/// Load rumdl config for a given file directory and project root.
/// Falls back to a minimal default config if none found.
pub fn load_rumdl_config(file_dir: &Path, project_root: &Path) -> Result<Config, String> {
    let config_path =
        SourcedConfig::<ConfigLoaded>::discover_config_for_dir(file_dir, project_root);

    let config = if let Some(cfg_path) = config_path {
        let loaded = SourcedConfig::<ConfigLoaded>::load_sourced_for_path(&cfg_path, project_root)
            .map_err(|e| format!("Failed to load rumdl config: {}", e))?;
        loaded.into_validated_unchecked().into()
    } else {
        rumdl_lib::config::Config::default()
    };

    Ok(config)
}
