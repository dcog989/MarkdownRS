use regex::Regex;
use std::sync::LazyLock;

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
pub(super) fn transform_callouts(html: &str) -> String {
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
