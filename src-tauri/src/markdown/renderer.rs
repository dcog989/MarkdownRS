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

    linkify_wikilinks_ast(&arena, root);
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
/// path/wikilink linkification should be suppressed.
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

const HEX_DIGITS: &[u8; 16] = b"0123456789ABCDEF";

/// Percent-encodes a file path into `out`, keeping unreserved characters and `/` intact.
fn percent_encode_into(out: &mut String, s: &str) {
    out.reserve(s.len());
    let mut buf = [0; 4];
    for c in s.chars() {
        match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' | '/' => out.push(c),
            _ => {
                let encoded = c.encode_utf8(&mut buf);
                for &b in encoded.as_bytes() {
                    out.push('%');
                    out.push(HEX_DIGITS[(b >> 4) as usize] as char);
                    out.push(HEX_DIGITS[(b & 0x0F) as usize] as char);
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

// Matches wikilinks: `[[target]]` or `[[label|target]]`.
// The target (group 1) may be a note name or a relative path; the label
// (group 2) is optional display text.
static WIKILINK_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\[\]|]+)(?:\|([^\[\]|]+))?\]\]").expect("Invalid WIKILINK_REGEX pattern")
});

/// Walks the AST and replaces `[[target]]` / `[[label|target]]` wikilinks with
/// HtmlInline anchor nodes, operating purely on text nodes so existing HTML
/// attributes are never touched. Runs before file-path linkification so a
/// wikilink target is rendered as a single link instead of being split apart.
fn linkify_wikilinks_ast<'a>(arena: &'a Arena<'a>, root: &'a AstNode<'a>) {
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

        let mut captures = WIKILINK_REGEX.captures_iter(text).peekable();
        if captures.peek().is_none() {
            continue;
        }

        let mut last_end = 0;
        let mut new_nodes: Vec<&AstNode<'_>> = Vec::new();

        for cap in captures {
            let full = cap.get(0).expect("group 0");
            let target = cap.get(1).expect("group 1").as_str().trim();

            if target.is_empty() {
                last_end = full.end();
                continue;
            }

            let before = &text[last_end..full.start()];
            if !before.is_empty() {
                let n = arena.alloc(AstNode::from(NodeValue::Text(Cow::Owned(
                    before.to_string(),
                ))));
                new_nodes.push(n);
            }

            let display = cap
                .get(2)
                .map(|m| m.as_str().trim())
                .filter(|s| !s.is_empty())
                .unwrap_or(target);

            link_buf.push_str(r#"<a href=""#);
            percent_encode_into(&mut link_buf, target);
            link_buf.push_str(r#"" class="wikilink" style="color: var(--accent-filepath); text-decoration: underline; cursor: pointer;">"#);
            html_escape_into(&mut link_buf, display);
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

        let mut captures = PATH_REGEX.captures_iter(text).peekable();
        if captures.peek().is_none() {
            continue;
        }

        let mut last_end = 0;
        let mut new_nodes: Vec<&AstNode<'_>> = Vec::new();

        for cap in captures {
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
            link_buf.push_str(r#"" class="file-path-link" style="color: var(--accent-filepath); text-decoration: underline; cursor: pointer;">"#);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::config::MarkdownFlavor;

    fn render_gfm(content: &str) -> String {
        render_markdown(
            content,
            MarkdownOptions {
                flavor: MarkdownFlavor::Gfm,
            },
        )
        .expect("render should succeed")
        .html
    }

    #[test]
    fn renders_dollar_math_with_math_style_attributes() {
        let html = render_gfm("Inline $x^2$ and display $$y = x + 1$$.\n");
        assert!(html.contains(r#"data-math-style="inline""#));
        assert!(html.contains(r#"data-math-style="display""#));
        assert!(html.contains("x^2"));
        assert!(html.contains("y = x + 1"));
    }

    #[test]
    fn renders_latex_delimited_math() {
        let html = render_gfm(r"Inline \(a < b\) and display \[c = a\].\n");
        assert!(html.contains(r#"data-math-style="inline""#));
        assert!(html.contains(r#"data-math-style="display""#));
        assert!(html.contains("a &lt; b"));
        assert!(html.contains("c = a"));
    }

    #[test]
    fn renders_math_code_fence() {
        let html = render_gfm("```math\nE = mc^2\n```\n");
        assert!(html.contains(r#"class="language-math" data-math-style="display""#));
        assert!(html.contains("E = mc^2"));
    }

    #[test]
    fn renders_multiline_display_math_block() {
        let html = render_gfm(
            "$$\n% \\f is defined as #1f(#2) using the macro\n\\f\\relax{x} = \\int_{-\\infty}^\\infty\n    \\f\\hat\\xi\\,e^{2 \\pi i \\xi x}\n    \\,d\\xi\n$$\n",
        );
        assert!(html.contains(r#"data-math-style="display""#));
        assert!(html.contains(r"\f\relax{x} = \int_{-\infty}^\infty"));
    }

    #[test]
    fn leaves_plain_markdown_untouched() {
        let html = render_gfm("Hello *world*.\n");
        assert!(!html.contains("data-math-style"));
        assert!(html.contains("<em"));
    }

    #[test]
    fn renders_wikilink_as_link() {
        let html = render_gfm("See [[notes/foo]] for details.\n");
        assert!(html.contains(r#"<a href="notes/foo" class="wikilink""#));
        assert!(html.contains(">notes/foo</a>"));
    }

    #[test]
    fn renders_wikilink_with_display_label() {
        let html = render_gfm("Go to [[notes/foo|the notes]] now.\n");
        assert!(html.contains(r#"<a href="notes/foo" class="wikilink""#));
        assert!(html.contains(">the notes</a>"));
        assert!(!html.contains(">notes/foo</a>"));
    }

    #[test]
    fn renders_wikilink_with_spaces_percent_encoded() {
        let html = render_gfm("Open [[my note.md]].\n");
        assert!(html.contains(r#"<a href="my%20note.md" class="wikilink""#));
        assert!(html.contains(">my note.md</a>"));
    }

    #[test]
    fn suppresses_wikilinks_inside_code_and_links() {
        let html = render_gfm("`[[foo]]`\n\n```\n[[bar]]\n```\n\n[text [[baz]]](url)\n");
        assert!(!html.contains("class=\"wikilink\""));
        assert!(html.contains("<code"));
        assert!(html.contains("[[foo]]"));
    }

    #[test]
    fn wikilink_is_not_double_linkified_by_file_path_pass() {
        let html = render_gfm("Point to [[../docs/notes.md]].\n");
        assert_eq!(html.matches("class=\"wikilink\"").count(), 1);
        assert_eq!(html.matches(r#"<a href="#).count(), 1);
        assert!(html.contains(r#"href="../docs/notes.md""#));
    }
}
