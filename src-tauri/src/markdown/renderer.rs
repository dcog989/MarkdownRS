use crate::markdown::{HeadingEntry, config::MarkdownFlavor, extract_headings_from_ast};
use anyhow::{Result, anyhow};
use comrak::nodes::{AstNode, NodeValue};
use comrak::{Anchorizer, Arena, format_html_with_plugins, options::Plugins, parse_document};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
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
    pub headings: Vec<HeadingEntry>,
}

/// Renders markdown to HTML with line number tracking and document metrics
pub fn render_markdown(content: &str, options: MarkdownOptions) -> Result<RenderResult> {
    let comrak_options = options.flavor.to_comrak_options();

    let arena = Arena::new();
    let root = parse_document(&arena, content, &comrak_options);

    linkify_file_paths_ast(&arena, root);

    let headings = extract_headings_from_ast(root, &mut Anchorizer::new());

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
        headings,
    })
}

// Matches file paths in plain text:
// - Windows absolute: C:/ or C:\
// - Unix absolute: /some/dir/file (requires at least one slash-separated segment)
// - Relative: ./ or ../
// - Home directory: ~/
static PATH_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?:^|\s)([A-Za-z]:[/\\][^\s<>"'|?*`]*|(?:\./|\.\./|~/)[^\s<>"'|?*`]+|/(?:[^/\s<>"'|?*`]+/)+(?:[^/\s<>"'|?*`]+)?)"#,
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

/// Percent-encodes a file path into `out`, keeping unreserved characters and `/` intact.
fn percent_encode_into(out: &mut String, s: &str) {
    out.reserve(s.len());
    for c in s.chars() {
        match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' | '/' => out.push(c),
            _ => {
                let mut buf = [0; 4];
                let encoded = c.encode_utf8(&mut buf);
                for b in encoded.as_bytes() {
                    out.push_str(&format!("%{:02X}", b));
                }
            },
        }
    }
}

/// Escapes characters with special meaning in HTML text / attributes into `out`.
fn html_escape_into(out: &mut String, s: &str) {
    out.reserve(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
}

/// Walks the AST and replaces file-path text segments with HtmlInline link nodes,
/// operating purely on text nodes so existing HTML attributes are never touched.
fn linkify_file_paths_ast<'a>(arena: &'a Arena<'a>, root: &'a AstNode<'a>) {
    let text_nodes: Vec<&AstNode<'_>> = root
        .descendants()
        .filter(|node| {
            matches!(node.data.borrow().value, NodeValue::Text(_)) && !is_in_code_or_link(node)
        })
        .collect();

    let mut link_buf = String::new();

    for node in text_nodes {
        let node_data = node.data.borrow();
        let text = match &node_data.value {
            NodeValue::Text(t) => t.as_ref(),
            _ => continue,
        };

        if !PATH_REGEX.is_match(text) {
            continue;
        }

        let mut last_end = 0;
        let mut new_nodes: Vec<&AstNode<'_>> = Vec::new();

        for cap in PATH_REGEX.captures_iter(text) {
            let full = cap.get(0).expect("group 0");
            let path_match = cap.get(1).expect("group 1");

            let before = &text[last_end..path_match.start()];
            if !before.is_empty() {
                let n = arena.alloc(AstNode::from(NodeValue::Text(Cow::Owned(
                    before.to_string(),
                ))));
                new_nodes.push(n);
            }

            let path = path_match.as_str();
            link_buf.push_str(r#"<a href=""#);
            percent_encode_into(&mut link_buf, path);
            link_buf.push_str(r#"" class="file-path-link" style="color: var(--color-accent-filepath); text-decoration: underline; cursor: pointer;">"#);
            html_escape_into(&mut link_buf, path);
            link_buf.push_str("</a>");
            let n = arena.alloc(AstNode::from(NodeValue::HtmlInline(std::mem::take(
                &mut link_buf,
            ))));
            new_nodes.push(n);

            last_end = full.end();
        }

        if last_end < text.len() {
            let tail = &text[last_end..];
            let n = arena.alloc(AstNode::from(NodeValue::Text(Cow::Owned(tail.to_string()))));
            new_nodes.push(n);
        }

        if new_nodes.is_empty() {
            continue;
        }

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
