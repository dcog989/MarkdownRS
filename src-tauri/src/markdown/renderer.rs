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

    let html = transform_callouts(&html);

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

/// Matches a GitHub-style callout marker at the start of a paragraph.
static CALLOUT_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^\[!(note|tip|important|warning|caution)\][ \t]*\r?\n?")
        .expect("Invalid CALLOUT_REGEX pattern")
});

/// GitHub-style callout type -> (css class, display title).
fn callout_style(kind: &str) -> (&'static str, &'static str) {
    match kind.to_ascii_lowercase().as_str() {
        "tip" => ("tip", "Tip"),
        "important" => ("important", "Important"),
        "warning" => ("warning", "Warning"),
        "caution" => ("caution", "Caution"),
        _ => ("note", "Note"),
    }
}

/// Obsidian-style inline icon for a callout type. Stroke-based (lucide-like)
/// SVGs so they match the app's icon set and inherit the callout accent color.
fn callout_icon(kind: &str) -> String {
    let attrs = "class=\"callout-icon\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"";
    let inner = match kind {
        "tip" => {
            "<path d=\"M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z\"/>"
        },
        "important" => "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 8v4M12 16h.01\"/>",
        "warning" => {
            "<path d=\"M21.7 18.5 13.5 4.4a1.9 1.9 0 0 0-3 0L2.3 18.5A1.9 1.9 0 0 0 4 21h16a1.9 1.9 0 0 0 1.7-2.5z\"/><path d=\"M12 9v4M12 17h.01\"/>"
        },
        "caution" => {
            "<path d=\"M7.9 2h8.2L22 7.9v8.2l-5.9 5.9H7.9L2 16.1V7.9z\"/><path d=\"M12 8v4M12 16h.01\"/>"
        },
        _ => "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4M12 8h.01\"/>",
    };
    format!(r#"<svg {attrs}>{inner}</svg>"#)
}

/// Transforms GitHub-style alert blockquotes (`> [!NOTE]`) into callout markup.
///
/// comrak renders alerts as `<blockquote>` whose first paragraph starts with a
/// `[!TYPE]` marker. For each matching blockquote the opening tag becomes a
/// `<div class="callout callout-{type}">`, a title paragraph is prepended, the
/// marker is stripped from the body, and the matching `</blockquote>` becomes
/// `</div>`. Blockquotes are matched with a stack so nested blockquotes and
/// callouts are handled correctly. All edits are spliced into a fresh buffer by
/// descending position, so nested replacements never shift earlier offsets.
fn transform_callouts(html: &str) -> String {
    let opens: Vec<usize> = html.match_indices("<blockquote").map(|(i, _)| i).collect();
    let closes: Vec<usize> = html
        .match_indices("</blockquote>")
        .map(|(i, _)| i)
        .collect();
    if opens.len() != closes.len() {
        return html.to_string();
    }

    let mut stack: Vec<usize> = Vec::new();
    let mut edits: Vec<(usize, usize, String)> = Vec::new();

    let mut push_edit = |open_pos: usize, close_pos: usize| {
        if let Some(edit) = transform_callout_block(html, open_pos, close_pos) {
            edits.push(edit);
        }
    };

    let mut oi = 0;
    let mut ci = 0;
    while oi < opens.len() || ci < closes.len() {
        let o = opens.get(oi).copied();
        let c = closes.get(ci).copied();
        match (o, c) {
            (Some(o), Some(c)) if c < o => {
                ci += 1;
                if let Some(open_pos) = stack.pop() {
                    push_edit(open_pos, c);
                }
            },
            (Some(o), _) => {
                stack.push(o);
                oi += 1;
            },
            (None, Some(c)) => {
                ci += 1;
                if let Some(open_pos) = stack.pop() {
                    push_edit(open_pos, c);
                }
            },
            (None, None) => break,
        }
    }

    if edits.is_empty() {
        return html.to_string();
    }

    edits.sort_by_key(|(start, _, _)| std::cmp::Reverse(*start));
    let mut out = html.to_string();
    for (start, end, replacement) in edits {
        out.replace_range(start..end, &replacement);
    }
    out
}

/// Builds the splice for a single callout blockquote. Returns `None` when the
/// blockquote does not open with a callout-marker paragraph.
fn transform_callout_block(
    html: &str,
    open_pos: usize,
    close_pos: usize,
) -> Option<(usize, usize, String)> {
    let tag_end = html[open_pos..].find('>')? + open_pos;

    let first_tag = html[tag_end + 1..].find('<')? + tag_end + 1;
    if html[first_tag..].starts_with("<blockquote") {
        return None;
    }
    let p_start = first_tag;
    if !html[p_start..].starts_with("<p") {
        return None;
    }

    let p_tag_end = html[p_start..].find('>')? + p_start;
    let content_start = p_tag_end + 1;
    let content_end = html[content_start..]
        .find("</p>")
        .map(|i| content_start + i)?;

    let marker = CALLOUT_REGEX.captures(&html[content_start..content_end])?;
    let marker_match = marker.get(0)?;
    let (class, title) = callout_style(marker.get(1)?.as_str());

    let attrs = &html[open_pos + "<blockquote".len()..tag_end];
    let icon = callout_icon(class);
    let mut out = String::new();
    out.push_str(&format!(
        r#"<div class="callout callout-{class}"{attrs}><p class="callout-title">{icon}<span class="callout-title-text">{title}</span></p>"#
    ));
    out.push_str(&html[tag_end + 1..p_start]);

    let marker_end = content_start + marker_match.len();
    if !html[marker_end..content_end].trim().is_empty() {
        out.push_str(&html[p_start..p_tag_end + 1]);
        out.push_str(&html[marker_end..content_end]);
        out.push_str("</p>");
    }

    out.push_str(&html[content_end + "</p>".len()..close_pos]);
    out.push_str("</div>");

    Some((open_pos, close_pos + "</blockquote>".len(), out))
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

    #[test]
    fn renders_footnotes_with_definition_section() {
        let html = render_gfm("Hello[^1] world.\n\n[^1]: A footnote note.\n");
        assert!(html.contains(r#"class="footnote-ref""#));
        assert!(html.contains(r##"href="#fn-1""##));
        assert!(html.contains(r##"id="fn-1""##));
        assert!(html.contains("class=\"footnotes\""));
        assert!(html.contains("A footnote note."));
        assert!(html.contains("footnote-backref"));
    }

    #[test]
    fn transforms_callout_blockquote_with_body() {
        let html = render_gfm("> [!NOTE]\n> Some note with **bold** text.\n");
        assert!(html.contains(r#"<div class="callout callout-note""#));
        assert!(html.contains(r#"<span class="callout-title-text">Note</span>"#));
        assert!(html.contains("class=\"callout-icon\""));
        assert!(html.contains("Some note with <strong"));
        assert!(html.contains("bold</strong> text."));
        assert!(!html.contains("<blockquote"));
        assert!(html.contains("</div>"));
    }

    #[test]
    fn transforms_callout_with_marker_paragraph_only() {
        let html = render_gfm("> [!TIP]\n>\n> Body in its own paragraph.\n");
        assert!(html.contains(r#"<div class="callout callout-tip""#));
        assert!(html.contains(r#"<span class="callout-title-text">Tip</span>"#));
        assert!(html.contains("Body in its own paragraph."));
        assert!(!html.contains("[!TIP]"));
    }

    #[test]
    fn transforms_callout_with_list_body() {
        let html = render_gfm("> [!CAUTION]\n> - item one\n> - item two\n");
        assert!(html.contains(r#"<div class="callout callout-caution""#));
        assert!(html.contains("<li"));
        assert!(html.contains("item one"));
        assert!(html.contains("item two"));
    }

    #[test]
    fn transforms_callout_with_trailing_text_on_marker_line() {
        let html = render_gfm("> [!WARNING] Careful now\n> more text\n");
        assert!(html.contains(r#"<div class="callout callout-warning""#));
        assert!(html.contains("Careful now"));
        assert!(html.contains("more text"));
        assert!(!html.contains("[!WARNING]"));
    }

    #[test]
    fn leaves_regular_blockquotes_untouched() {
        let html = render_gfm("> regular quote\n> with two lines\n");
        assert!(html.contains("<blockquote"));
        assert!(!html.contains("callout"));
    }

    #[test]
    fn leaves_non_callout_markers_untouched() {
        let html = render_gfm("> [!CUSTOM]\n> not a box\n");
        assert!(html.contains("[!CUSTOM]"));
        assert!(!html.contains("callout"));
    }

    #[test]
    fn transforms_case_insensitive_marker() {
        let html = render_gfm("> [!important]\n> important text\n");
        assert!(html.contains(r#"class="callout callout-important""#));
        assert!(html.contains(r#"<span class="callout-title-text">Important</span>"#));
    }

    #[test]
    fn transforms_multiple_callouts_and_leaves_plain_quote() {
        let doc = "\
> [!NOTE]\n\
> Useful information users should know.\n\
\n\
> [!TIP]\n\
> Helpful advice.\n\
\n\
> [!IMPORTANT]\n\
> Crucial info that requires user action.\n\
\n\
> [!WARNING]\n\
> Proceed with caution.\n\
\n\
> [!CAUTION]\n\
> Risk of damage or data loss.\n\
\n\
> Regular quote, no box.\n";
        let html = render_gfm(doc);
        for class in [
            "callout-note",
            "callout-tip",
            "callout-important",
            "callout-warning",
            "callout-caution",
        ] {
            assert!(
                html.contains(&format!(r#"class="callout {class}""#)),
                "missing {class}"
            );
        }
        assert_eq!(html.matches("class=\"callout-icon\"").count(), 5);
        assert!(!html.contains("[!"), "markers should be stripped: {html}");
        assert!(html.contains("<blockquote"));
        assert!(html.contains("Regular quote"));
    }

    #[test]
    fn handles_nested_blockquotes_without_mis_transform() {
        let html = render_gfm("> outer\n> > inner text\n");
        assert!(html.contains("<blockquote"));
        assert!(!html.contains("callout"));
    }
}
