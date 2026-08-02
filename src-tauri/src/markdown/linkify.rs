use comrak::Arena;
use comrak::nodes::{AstNode, NodeValue};
use regex::Regex;
use std::borrow::Cow;
use std::sync::LazyLock;

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

// Matches wikilinks: `[[target]]` or `[[label|target]]`.
// The target (group 1) may be a note name or a relative path; the label
// (group 2) is optional display text.
static WIKILINK_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\[\]|]+)(?:\|([^\[\]|]+))?\]\]").expect("Invalid WIKILINK_REGEX pattern")
});

const HEX_DIGITS: &[u8; 16] = b"0123456789ABCDEF";

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

/// A single link replacement: `(content_start, full_end, link_html)`.
/// `content_start`..`full_end` is the span of `text` consumed by the link
/// (the "before" slice runs up to `content_start`, the tail from `full_end`).
type Splice = (usize, usize, String);

/// Walks the AST and rewrites matches of `regex` inside plain text nodes into
/// HtmlInline anchor nodes, operating purely on text nodes so existing HTML
/// attributes are never touched. For each match, `build_link` returns a splice
/// (or `None` to skip the match without consuming it).
fn linkify_text_nodes<'a>(
    arena: &'a Arena<'a>,
    root: &'a AstNode<'a>,
    regex: &'static Regex,
    build_link: impl Fn(&regex::Captures<'_>) -> Option<Splice>,
) {
    let text_nodes: Vec<&AstNode<'_>> = root
        .descendants()
        .filter(|node| {
            matches!(node.data.borrow().value, NodeValue::Text(_)) && !is_in_code_or_link(node)
        })
        .collect();

    for node in text_nodes {
        let node_data = node.data.borrow();
        let text = match &node_data.value {
            NodeValue::Text(t) => t.as_ref(),
            _ => continue,
        };

        let mut captures = regex.captures_iter(text).peekable();
        if captures.peek().is_none() {
            continue;
        }

        let mut last_end = 0;
        let mut new_nodes: Vec<&AstNode<'_>> = Vec::new();

        for cap in captures {
            let (content_start, full_end, link_html) = match build_link(&cap) {
                Some(splice) => splice,
                None => {
                    last_end = cap.get(0).expect("group 0").end();
                    continue;
                },
            };

            let before = &text[last_end..content_start];
            if !before.is_empty() {
                let n = arena.alloc(AstNode::from(NodeValue::Text(Cow::Owned(
                    before.to_string(),
                ))));
                new_nodes.push(n);
            }

            let n = arena.alloc(AstNode::from(NodeValue::HtmlInline(link_html)));
            new_nodes.push(n);

            last_end = full_end;
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

/// Builds a wikilink splice for a `[[target]]` / `[[label|target]]` match, or
/// `None` when the target is blank. The whole `[[...]]` span is consumed.
fn build_wikilink_link(cap: &regex::Captures<'_>) -> Option<Splice> {
    let full = cap.get(0)?;
    let target = cap.get(1)?.as_str().trim();

    if target.is_empty() {
        return None;
    }

    let display = cap
        .get(2)
        .map(|m| m.as_str().trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(target);

    let mut link = String::from(r#"<a href=""#);
    percent_encode_into(&mut link, target);
    link.push_str(r#"" class="wikilink" style="color: var(--accent-filepath); text-decoration: underline; cursor: pointer;">"#);
    html_escape_into(&mut link, display);
    link.push_str("</a>");

    Some((full.start(), full.end(), link))
}

/// Walks the AST and replaces `[[target]]` / `[[label|target]]` wikilinks with
/// HtmlInline anchor nodes. Runs before file-path linkification so a wikilink
/// target is rendered as a single link instead of being split apart.
pub(super) fn linkify_wikilinks_ast<'a>(arena: &'a Arena<'a>, root: &'a AstNode<'a>) {
    linkify_text_nodes(arena, root, &WIKILINK_REGEX, build_wikilink_link);
}

/// Builds a file-path splice for a path match, keeping the leading whitespace
/// captured by the regex in the "before" text.
fn build_file_path_link(cap: &regex::Captures<'_>) -> Option<Splice> {
    let full = cap.get(0)?;
    let path_match = cap.get(1)?;
    let path = path_match.as_str();

    let mut link = String::from(r#"<a href=""#);
    percent_encode_into(&mut link, path);
    link.push_str(r#"" class="file-path-link" style="color: var(--accent-filepath); text-decoration: underline; cursor: pointer;">"#);
    html_escape_into(&mut link, path);
    link.push_str("</a>");

    Some((path_match.start(), full.end(), link))
}

/// Walks the AST and replaces file-path text segments with HtmlInline link nodes.
pub(super) fn linkify_file_paths_ast<'a>(arena: &'a Arena<'a>, root: &'a AstNode<'a>) {
    linkify_text_nodes(arena, root, &PATH_REGEX, build_file_path_link);
}

#[cfg(test)]
mod tests {
    use crate::markdown::{config::MarkdownFlavor, renderer::MarkdownOptions};

    fn render_gfm(content: &str) -> String {
        crate::markdown::renderer::render_markdown(
            content,
            MarkdownOptions {
                flavor: MarkdownFlavor::Gfm,
            },
        )
        .expect("render should succeed")
        .html
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

    #[test]
    fn renders_file_path_as_link() {
        let html = render_gfm("Open /home/user/docs/file.md now.\n");
        assert!(html.contains(r#"<a href="/home/user/docs/file.md" class="file-path-link""#));
    }

    #[test]
    fn leaves_code_and_links_untouched_by_file_path_pass() {
        let html = render_gfm("`/path/to/file` and [text](/path) and ./rel/file here.\n");
        assert!(html.contains("<code"));
        assert!(html.contains("/path/to/file"));
        assert!(html.contains(r#"href="/path">text</a>"#));
        assert_eq!(html.matches("class=\"file-path-link\"").count(), 1);
        assert!(html.contains(r#"href="./rel/file" class="file-path-link""#));
    }

    #[test]
    fn does_not_linkify_blank_wikilink_targets() {
        let html = render_gfm("Text [[ ]] stays as-is.\n");
        assert!(!html.contains("class=\"wikilink\""));
    }
}
