use crate::markdown::config::MarkdownFlavor;
use anyhow::{Result, anyhow};
use comrak::nodes::{AstNode, NodeValue};
use comrak::{Arena, format_html_with_plugins, options::Plugins, parse_document};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use unicode_segmentation::UnicodeSegmentation;

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

    let (line_map, line_count, word_count, char_count, widest_column) =
        build_line_map_and_metrics(content);

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

fn build_line_map_and_metrics(content: &str) -> (Vec<usize>, usize, usize, usize, usize) {
    if content.is_empty() {
        return (vec![0], 0, 0, 0, 0);
    }

    let mut line_map = Vec::new();
    let mut offset = 0;
    let mut char_count = 0;
    let mut widest_column = 0;
    let mut current_column = 0;

    line_map.push(0);
    for c in content.chars() {
        char_count += 1;
        if c == '\n' {
            line_map.push(offset + 1);
            if current_column > widest_column {
                widest_column = current_column;
            }
            current_column = 0;
        } else {
            current_column += 1;
        }
        offset += c.len_utf8();
    }

    if current_column > widest_column {
        widest_column = current_column;
    }

    let line_count = line_map.len();
    let word_count = content.unicode_words().count();

    (line_map, line_count, word_count, char_count, widest_column)
}

pub fn calculate_text_metrics(content: &str) -> (usize, usize, usize, usize) {
    let (_, line_count, word_count, char_count, widest_column) =
        build_line_map_and_metrics(content);
    (line_count, word_count, char_count, widest_column)
}
