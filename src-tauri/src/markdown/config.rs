use crate::state::AppState;
use comrak::Options;
use comrak::options::{Extension, Parse, Render};
use rumdl_lib::config::{Config, ConfigLoaded, SourcedConfig, default_registry};
use rumdl_lib::rule::Rule;
use rumdl_lib::rules::{all_rules, filter_rules};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

pub struct ResolvedPaths {
    pub file_path: Option<PathBuf>,
    pub project_root: Option<PathBuf>,
}

pub fn resolve_paths(file_path: Option<&str>, state: &AppState) -> ResolvedPaths {
    ResolvedPaths {
        file_path: file_path.map(PathBuf::from),
        project_root: state.project_root.lock().ok().and_then(|r| r.clone()),
    }
}

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
    /// Canonical lowercase name for this flavor (matches serde serialization).
    pub fn as_str(self) -> &'static str {
        match self {
            Self::CommonMark => "commonmark",
            Self::Gfm => "gfm",
        }
    }

    /// All supported flavors in canonical order.
    pub fn all() -> Vec<&'static str> {
        [Self::CommonMark, Self::Gfm]
            .into_iter()
            .map(Self::as_str)
            .collect()
    }

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
                    footnotes: true,
                    math_dollars: true,
                    math_latex: true,
                    math_code: true,
                    ..Default::default()
                },
            },
            parse: Parse {
                smart: true,
                default_info_string: None,
                ..Default::default()
            },
            render: Render {
                r#unsafe: true,
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
    config: Arc<Config>,
    rules: Arc<Vec<Box<dyn Rule>>>,
}

static CACHE: Mutex<Option<CachedState>> = Mutex::new(None);

/// Cached user-level config path, refreshed only when the remembered path
/// disappears. Avoids re-running full discovery (~6 `path.exists()` calls)
/// on every lint/format invocation for file-less buffers.
static USER_CONFIG_PATH: Mutex<Option<Option<PathBuf>>> = Mutex::new(None);

type RulesPair = (Arc<Config>, Arc<Vec<Box<dyn Rule>>>);
type RulesResult = Result<RulesPair, String>;

fn default_rules_impl() -> RulesPair {
    let config = rumdl_lib::config::Config::default();
    let all = all_rules(&config);
    let filtered = filter_rules(&all, &config.global);
    (Arc::new(config), Arc::new(filtered))
}

/// Load default config + filtered rules (no config file discovery).
/// Rules are created once and cached with OnceLock.
pub fn load_default_rules() -> &'static RulesPair {
    static DEFAULT: std::sync::OnceLock<RulesPair> = std::sync::OnceLock::new();
    DEFAULT.get_or_init(default_rules_impl)
}

fn load_full_state(project_root: &Path, cfg_path: &Path) -> RulesResult {
    let loaded = SourcedConfig::<ConfigLoaded>::load_sourced_for_path(cfg_path, project_root)
        .map_err(|e| format!("Failed to load rumdl config: {}", e))?;
    let registry = default_registry();
    let (config, _warnings) = loaded
        .validate_into(registry)
        .map_err(|e| format!("Config validation failed: {}", e))?;

    let all = all_rules(&config);
    let filtered = filter_rules(&all, &config.global);

    Ok((Arc::new(config), Arc::new(filtered)))
}

/// Discover user-level rumdl config path.
///
/// Checks (in order):
/// 1. Platform config dir (`~/.config/rumdl/` on Linux, `%APPDATA%/rumdl/` on Windows)
///    for `rumdl.toml` and `.rumdl.toml`
/// 2. Home directory for `~/.rumdl.toml` and `~/rumdl.toml`
pub fn discover_user_config_path() -> Option<PathBuf> {
    // Platform config dir (XDG on Linux, APPDATA on Windows)
    if let Some(config_dir) = dirs::config_dir() {
        let rumdl_config_dir = config_dir.join("rumdl");
        for name in &[".rumdl.toml", "rumdl.toml"] {
            let path = rumdl_config_dir.join(name);
            if path.exists() {
                return Some(path);
            }
        }
    }

    // Home directory dotfile fallback
    if let Some(home) = dirs::home_dir() {
        for name in &[".rumdl.toml", "rumdl.toml"] {
            let path = home.join(name);
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}

/// Resolve the user-level rumdl config path with caching.
///
/// The first call performs full discovery; subsequent calls reuse the cached
/// result as long as the remembered path still exists, re-discovering only if
/// it disappears. Note that a config file created *after* the first discovery
/// is not picked up until restart or until the remembered path is deleted.
fn user_config_path() -> Option<PathBuf> {
    let mut cached = USER_CONFIG_PATH.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(Some(path)) = cached.as_ref()
        && path.exists()
    {
        return Some(path.clone());
    }
    let discovered = discover_user_config_path();
    *cached = Some(discovered.clone());
    discovered
}

/// Discover the rumdl config path for a given file directory and project root,
/// falling back to user-level config if no project config is found.
pub fn discover_config_path(file_dir: &Path, project_root: &Path) -> Option<PathBuf> {
    SourcedConfig::<ConfigLoaded>::discover_config_for_dir(file_dir, project_root)
        .or_else(discover_user_config_path)
}

/// Load rumdl config + filtered rules, using a cache that invalidates when
/// the discovered config file's path or mtime changes. Applies to both
/// file-backed and file-less (unsaved buffer) invocations.
pub fn load_rules_for_file(file_path: Option<&Path>, project_root: Option<&Path>) -> RulesResult {
    match file_path {
        Some(fp) => {
            let file_dir = fp.parent().unwrap_or_else(|| Path::new(""));
            let pr = project_root.unwrap_or(file_dir);
            load_rumdl_rules(file_dir, pr)
        },
        None => {
            let home = dirs::home_dir().unwrap_or_default();
            let pr = project_root.unwrap_or(&home);
            load_cached_rules(user_config_path(), pr)
        },
    }
}

pub fn load_rumdl_rules(file_dir: &Path, project_root: &Path) -> RulesResult {
    let candidate_path =
        SourcedConfig::<ConfigLoaded>::discover_config_for_dir(file_dir, project_root)
            .or_else(user_config_path);
    load_cached_rules(candidate_path, project_root)
}

/// Build (or fetch from cache) filtered rules for a candidate config path.
///
/// The fast path compares the candidate path and its mtime against the cache
/// and returns the existing config + rules without re-parsing or rebuilding.
fn load_cached_rules(candidate_path: Option<PathBuf>, project_root: &Path) -> RulesResult {
    let candidate_mtime = candidate_path
        .as_ref()
        .and_then(|p| p.metadata().ok())
        .and_then(|m| m.modified().ok());

    // Check cache by (path, mtime).
    {
        let cache = CACHE
            .lock()
            .map_err(|_| "Cache lock poisoned".to_string())?;
        if let Some(cached) = cache.as_ref()
            && cached.config_path == candidate_path
            && cached.config_mtime == candidate_mtime
        {
            return Ok((Arc::clone(&cached.config), Arc::clone(&cached.rules)));
        }
    }

    // Slow path: build config outside the lock.
    let (config, rules) = if let Some(ref cp) = candidate_path {
        load_full_state(project_root, cp)?
    } else {
        let (c, r) = load_default_rules();
        (Arc::clone(c), Arc::clone(r))
    };

    // Store in cache.
    let mut cache = CACHE
        .lock()
        .map_err(|_| "Cache lock poisoned".to_string())?;
    *cache = Some(CachedState {
        config_path: candidate_path,
        config_mtime: candidate_mtime,
        config: Arc::clone(&config),
        rules: Arc::clone(&rules),
    });

    Ok((config, rules))
}
