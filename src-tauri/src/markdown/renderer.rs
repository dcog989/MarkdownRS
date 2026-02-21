use crate::markdown::config::MarkdownFlavor;
use anyhow::{Result, anyhow};
use comrak::nodes::{AstNode, NodeValue};
use comrak::{Arena, format_html_with_plugins, options::Plugins, parse_document};
use dashmap::DashMap;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};
use unicode_segmentation::UnicodeSegmentation;

const CACHE_MAX_ENTRIES: usize = 50;
const CACHE_MAX_AGE: Duration = Duration::from_secs(60);

struct CacheEntry {
    line_map: Vec<usize>,
    last_accessed: Instant,
}

/// Thread-safe LRU-style cache for line maps
/// - Limits entries to prevent unbounded memory growth
/// - Evicts entries older than CACHE_MAX_AGE
static LINE_MAP_CACHE: LazyLock<Arc<DashMap<(u64, MarkdownFlavor), CacheEntry>>> =
    LazyLock::new(|| Arc::new(DashMap::new()));

/// Computes a collision-resistant hash of content for cache key.
/// Includes content length to reduce collisions between short strings.
fn compute_content_hash(content: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    content.len().hash(&mut hasher);
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
    let mut to_remove: Vec<(u64, MarkdownFlavor)> = LINE_MAP_CACHE
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

/// Gets or builds the line map, using cache if content and flavor haven't changed
fn get_or_build_line_map(content: &str, flavor: MarkdownFlavor) -> Vec<usize> {
    let cache_key = (compute_content_hash(content), flavor);
    let now = Instant::now();

    // Check cache and update access time if found
    if let Some(mut entry) = LINE_MAP_CACHE.get_mut(&cache_key) {
        entry.last_accessed = now;
        return entry.line_map.clone();
    }

    // Build new line map
    let line_map = build_line_map(content);

    // Prune old entries before inserting
    prune_cache_if_needed();

    // Store in cache
    LINE_MAP_CACHE.insert(
        cache_key,
        CacheEntry {
            line_map: line_map.clone(),
            last_accessed: now,
        },
    );

    line_map
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct MarkdownOptions {
    pub flavor: MarkdownFlavor,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenderResult {
    pub html: String,
    pub line_map: Vec<usize>,
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

    linkify_file_paths_ast(&arena, root);

    let mut html = String::new();
    format_html_with_plugins(root, &comrak_options, &mut html, &Plugins::default())
        .map_err(|e| anyhow!("Failed to render markdown: {}", e))?;

    let line_map = get_or_build_line_map(content, options.flavor);

    // Single-pass metrics calculation
    let (line_count, word_count, char_count, widest_column) = calculate_text_metrics(content);

    Ok(RenderResult {
        html,
        line_map,
        line_count,
        word_count,
        char_count,
        widest_column,
    })
}

// Matches file paths in plain text:
// - Windows absolute: C:/ or C:\
// - Unix absolute: /some/dir/file (requires at least one slash-separated segment)
// - Relative: ./ or ../
// - Home directory: ~/
static PATH_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?:^|\s)([A-Za-z]:[/\\][^\s<>"'|?*`]*|(?:\./|\.\./|~/)[^\s<>"'|?*`]+|/(?:[^/\s<>"'|?*`]+/)+[^/\s<>"'|?*`]+)"#,
    )
    .expect("Invalid PATH_REGEX pattern")
});

/// Returns true if `node` is inside a code, pre, or link context where
/// path linkification should be suppressed.
fn is_in_code_or_link<'a>(node: &'a AstNode<'a>) -> bool {
    node.ancestors().any(|ancestor| {
        matches!(
            ancestor.data.borrow().value,
            NodeValue::Code(_)
                | NodeValue::CodeBlock(_)
                | NodeValue::HtmlBlock(_)
                | NodeValue::HtmlInline(_)
                | NodeValue::Link(_)
                | NodeValue::Image(_)
        )
    })
}

/// Walks the AST and replaces file-path text segments with HtmlInline link nodes,
/// operating purely on text nodes so existing HTML attributes are never touched.
fn linkify_file_paths_ast<'a>(arena: &'a Arena<'a>, root: &'a AstNode<'a>) {
    // Collect text nodes first to avoid mutating while iterating descendants
    let text_nodes: Vec<&AstNode<'_>> = root
        .descendants()
        .filter(|node| {
            matches!(node.data.borrow().value, NodeValue::Text(_)) && !is_in_code_or_link(node)
        })
        .collect();

    for node in text_nodes {
        let text = match &node.data.borrow().value {
            NodeValue::Text(t) => t.clone().into_owned(),
            _ => continue,
        };

        if !PATH_REGEX.is_match(&text) {
            continue;
        }

        // Build replacement sibling nodes: alternate Text / HtmlInline segments
        let mut last_end = 0;
        let mut new_nodes: Vec<&AstNode<'_>> = Vec::new();

        for cap in PATH_REGEX.captures_iter(&text) {
            let full = cap.get(0).expect("group 0");
            let path_match = cap.get(1).expect("group 1");

            // Leading whitespace / non-path prefix before the captured group
            let before = &text[last_end..path_match.start()];
            if !before.is_empty() {
                let n = arena.alloc(AstNode::from(NodeValue::Text(std::borrow::Cow::Owned(
                    before.to_string(),
                ))));
                new_nodes.push(n);
            }

            let path = path_match.as_str();
            let link_html = format!(
                r#"<a href="{path}" class="file-path-link" style="color: var(--color-accent-filepath); text-decoration: underline; cursor: pointer;">{path}</a>"#
            );
            let n = arena.alloc(AstNode::from(NodeValue::HtmlInline(link_html)));
            new_nodes.push(n);

            last_end = full.end();
        }

        // Trailing text after the last match
        if last_end < text.len() {
            let tail = &text[last_end..];
            let n = arena.alloc(AstNode::from(NodeValue::Text(std::borrow::Cow::Owned(
                tail.to_string(),
            ))));
            new_nodes.push(n);
        }

        if new_nodes.is_empty() {
            continue;
        }

        // Insert new sibling nodes before the original, then detach it
        for new_node in new_nodes {
            node.insert_before(new_node);
        }
        node.detach();
    }
}

fn build_line_map(content: &str) -> Vec<usize> {
    if content.is_empty() {
        return vec![0];
    }

    let mut line_map = Vec::new();
    let mut offset = 0;

    // index 0 = line 1 byte offset
    // Handle both LF and CRLF line endings correctly
    line_map.push(offset);
    for c in content.chars() {
        if c == '\n' {
            line_map.push(offset + 1);
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
