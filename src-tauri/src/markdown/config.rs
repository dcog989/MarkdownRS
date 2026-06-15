use comrak::Options;
use comrak::options::{Extension, Parse, Render};
use rumdl_lib::config::{Config, ConfigLoaded, SourcedConfig, default_registry};
use rumdl_lib::rule::Rule;
use rumdl_lib::rules::{all_rules, filter_rules};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

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

struct CachedState {
    config_path: Option<PathBuf>,
    config_mtime: Option<SystemTime>,
    config: Config,
    rules: Vec<Box<dyn Rule>>,
}

static CACHE: Mutex<Option<CachedState>> = Mutex::new(None);

pub(crate) fn clone_rules(rules: &[Box<dyn Rule>]) -> Vec<Box<dyn Rule>> {
    rules.iter().map(|r| dyn_clone::clone_box(&**r)).collect()
}

fn default_rules_impl() -> (Config, Vec<Box<dyn Rule>>) {
    let config = rumdl_lib::config::Config::default();
    let all = all_rules(&config);
    let filtered = filter_rules(&all, &config.global);
    (config, filtered)
}

/// Load default config + filtered rules (no config file discovery).
/// Rules are created once and cached with OnceLock.
pub fn load_default_rules() -> &'static (Config, Vec<Box<dyn Rule>>) {
    static DEFAULT: std::sync::OnceLock<(Config, Vec<Box<dyn Rule>>)> = std::sync::OnceLock::new();
    DEFAULT.get_or_init(default_rules_impl)
}

fn load_full_state(
    project_root: &Path,
    cfg_path: &Path,
) -> Result<(Config, Vec<Box<dyn Rule>>), String> {
    let loaded = SourcedConfig::<ConfigLoaded>::load_sourced_for_path(cfg_path, project_root)
        .map_err(|e| format!("Failed to load rumdl config: {}", e))?;
    let registry = default_registry();
    let (config, _warnings) = loaded
        .validate_into(registry)
        .map_err(|e| format!("Config validation failed: {}", e))?;

    let all = all_rules(&config);
    let filtered = filter_rules(&all, &config.global);

    Ok((config, filtered))
}

/// Load rumdl config + filtered rules, using a cache that invalidates when
/// the discovered config file's path or mtime changes.
pub fn load_rumdl_rules(
    file_dir: &Path,
    project_root: &Path,
) -> Result<(Config, Vec<Box<dyn Rule>>), String> {
    let candidate_path =
        SourcedConfig::<ConfigLoaded>::discover_config_for_dir(file_dir, project_root);
    let candidate_mtime = candidate_path
        .as_ref()
        .and_then(|p| p.metadata().ok())
        .and_then(|m| m.modified().ok());

    let mut cache = CACHE
        .lock()
        .map_err(|_| "Cache lock poisoned".to_string())?;

    let valid = cache
        .as_ref()
        .is_some_and(|c| c.config_path == candidate_path && c.config_mtime == candidate_mtime);

    if !valid {
        let (config, rules) = if let Some(ref cp) = candidate_path {
            load_full_state(project_root, cp)?
        } else {
            let (c, r) = load_default_rules();
            (c.clone(), clone_rules(r))
        };
        *cache = Some(CachedState {
            config_path: candidate_path,
            config_mtime: candidate_mtime,
            config: config.clone(),
            rules: clone_rules(&rules),
        });
        return Ok((config, rules));
    }

    let cached = cache.as_ref().unwrap();
    Ok((cached.config.clone(), clone_rules(&cached.rules)))
}
