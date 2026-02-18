use crate::markdown::config::MarkdownFlavor;
use anyhow::{Result, anyhow};
use comrak::{Arena, format_html_with_plugins, options::Plugins, parse_document};
use dashmap::DashMap;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};
use unicode_segmentation::UnicodeSegmentation;

const CACHE_MAX_ENTRIES: usize = 50;
const CACHE_MAX_AGE: Duration = Duration::from_secs(60);

struct CacheEntry {
    line_map: HashMap<usize, usize>,
    last_accessed: Instant,
}

/// Thread-safe LRU-style cache for line maps
/// - Limits entries to prevent unbounded memory growth
/// - Evicts entries older than CACHE_MAX_AGE
static LINE_MAP_CACHE: LazyLock<Arc<DashMap<u64, CacheEntry>>> =
    LazyLock::new(|| Arc::new(DashMap::new()));

/// Computes a fast hash of content for cache key
fn compute_content_hash(content: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}

/// Prunes old entries from cache if it exceeds size limit
fn prune_cache_if_needed() {
    if LINE_MAP_CACHE.len() <= CACHE_MAX_ENTRIES {
        return;
    }

    // Collect keys to remove (entries older than max age or excess entries)
    let now = Instant::now();
    let mut to_remove: Vec<u64> = LINE_MAP_CACHE
        .iter()
        .filter(|entry| now.duration_since(entry.last_accessed) > CACHE_MAX_AGE)
        .map(|entry| *entry.key())
        .collect();

    // If still over limit, remove oldest entries
    if LINE_MAP_CACHE.len() - to_remove.len() > CACHE_MAX_ENTRIES {
        let mut entries: Vec<_> = LINE_MAP_CACHE
            .iter()
            .map(|entry| (*entry.key(), entry.last_accessed))
            .collect();
        entries.sort_by_key(|(_, t)| *t);

        let to_evict = entries.len().saturating_sub(CACHE_MAX_ENTRIES / 2);
        for (key, _) in entries.into_iter().take(to_evict) {
            to_remove.push(key);
        }
    }

    for key in to_remove {
        LINE_MAP_CACHE.remove(&key);
    }
}

/// Gets or builds the line map, using cache if content hasn't changed
fn get_or_build_line_map(content: &str) -> HashMap<usize, usize> {
    let current_hash = compute_content_hash(content);
    let now = Instant::now();

    // Check cache and update access time if found
    if let Some(mut entry) = LINE_MAP_CACHE.get_mut(&current_hash) {
        entry.last_accessed = now;
        return entry.line_map.clone();
    }

    // Build new line map
    let line_map = build_line_map(content);

    // Prune old entries before inserting
    prune_cache_if_needed();

    // Store in cache
    LINE_MAP_CACHE.insert(
        current_hash,
        CacheEntry {
            line_map: line_map.clone(),
            last_accessed: now,
        },
    );

    line_map
}

// Lazy-compiled regex for file paths
// Matches:
// - Windows absolute paths: C:/ or C:\
// - Unix absolute paths: /path/to/file (requires at least one directory separator)
// - Relative paths: ./ or ../
// - Home directory: ~/
static PATH_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?:^|\s)([A-Za-z]:[/\\][^\s<>"'|?*`]*|(?:\./|\.\./|~/)[^\s<>"'|?*`]+|/(?:[^\/\s<>"'|?*`]+[/\\])+[^\/\s<>"'|?*`]+)"#,
    )
    .expect("Invalid PATH_REGEX pattern")
});

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct MarkdownOptions {
    pub flavor: MarkdownFlavor,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenderResult {
    pub html: String,
    pub line_map: HashMap<usize, usize>,
    pub line_count: usize,
    pub word_count: usize,
    pub char_count: usize,
    pub widest_column: usize,
}

/// Renders markdown to HTML with line number tracking and document metrics
pub fn render_markdown(content: &str, options: MarkdownOptions) -> Result<RenderResult> {
    let comrak_options = options.flavor.to_comrak_options();

    let arena = Arena::new();
    let root = parse_document(&arena, content, &comrak_options);

    let mut html = String::new();
    format_html_with_plugins(root, &comrak_options, &mut html, &Plugins::default())
        .map_err(|e| anyhow!("Failed to render markdown: {}", e))?;

    let html_with_links = linkify_file_paths(&html);
    let line_map = get_or_build_line_map(content);

    // Single-pass metrics calculation
    let (line_count, word_count, char_count, widest_column) = calculate_text_metrics(content);

    Ok(RenderResult {
        html: html_with_links,
        line_map,
        line_count,
        word_count,
        char_count,
        widest_column,
    })
}

fn linkify_file_paths(html: &str) -> String {
    let mut result = String::with_capacity(html.len() * 2);

    for line in html.lines() {
        let mut last_end = 0;
        for cap in PATH_REGEX.captures_iter(line) {
            let full_match = cap
                .get(0)
                .expect("Regex capture should always have group 0");
            let path = cap
                .get(1)
                .expect("Regex capture should always have group 1")
                .as_str();
            let start = full_match.start();
            let end = full_match.end();

            result.push_str(&line[last_end..start]);

            let leading_space = &full_match.as_str()[..full_match.as_str().len() - path.len()];
            result.push_str(leading_space);

            result.push_str(&format!(
                r#"<a href="{}" class="file-path-link" style="color: var(--color-accent-filepath); text-decoration: underline; cursor: pointer;">{}</a>"#,
                path, path
            ));

            last_end = end;
        }

        result.push_str(&line[last_end..]);
        result.push('\n');
    }

    result
}

fn build_line_map(content: &str) -> HashMap<usize, usize> {
    let mut line_map = HashMap::new();

    if content.is_empty() {
        line_map.insert(1, 0);
        return line_map;
    }

    let mut line_num = 1;
    let mut offset = 0;

    // Handle both LF and CRLF line endings correctly
    // Manually iterating to properly account for byte offsets
    line_map.insert(line_num, offset);
    for c in content.chars() {
        if c == '\n' {
            line_num += 1;
            line_map.insert(line_num, offset + 1);
        }
        offset += c.len_utf8();
    }

    line_map
}

/// Calculates text metrics in a single pass
/// Returns: (line_count, word_count, char_count, widest_column)
pub fn calculate_text_metrics(content: &str) -> (usize, usize, usize, usize) {
    let lines: Vec<&str> = content.lines().collect();
    let line_count = lines.len();
    let word_count = content.unicode_words().count();
    let char_count = content.chars().count();
    let widest_column = lines.iter().map(|l| l.chars().count()).max().unwrap_or(0);
    (line_count, word_count, char_count, widest_column)
}
