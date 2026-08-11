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
/// `</div>`. The output is built in a single left-to-right pass over the
/// original HTML: each `<blockquote>...</blockquote>` is emitted when its
/// closing tag is seen, at which point any nested blockquotes have already been
/// transformed and spliced into the parent's interior. This keeps nested
/// callouts correct (an earlier flat-edit model misaligned offsets whenever one
/// callout contained another).
///
/// Raw HTML `<blockquote>` tags (passed through when comrak renders with
/// `unsafe`) may unbalance the open/close counts. The stack matcher tolerates
/// this: unmatched opens are emitted verbatim on unwind and unmatched closes pop
/// nothing, so raw HTML never disables callout transformation for the rest of
/// the document.
pub(super) fn transform_callouts(html: &str) -> String {
    let opens: Vec<usize> = html.match_indices("<blockquote").map(|(i, _)| i).collect();
    let closes: Vec<usize> = html
        .match_indices("</blockquote>")
        .map(|(i, _)| i)
        .collect();

    let mut stack: Vec<CalloutFrame> = Vec::new();
    let mut out = String::with_capacity(html.len());
    let mut cursor = 0;

    let mut oi = 0;
    let mut ci = 0;

    while oi < opens.len() || ci < closes.len() {
        let o = opens.get(oi).copied();
        let c = closes.get(ci).copied();

        let (pos, is_open) = match (o, c) {
            (Some(o), Some(c)) if o < c => (o, true),
            (Some(_), Some(c)) => (c, false),
            (Some(o), None) => (o, true),
            (None, Some(c)) => (c, false),
            (None, None) => break,
        };

        // Copy the literal text up to this token into the current destination.
        if let Some(top) = stack.last_mut() {
            top.interior.push_str(&html[cursor..pos]);
        } else {
            out.push_str(&html[cursor..pos]);
        }

        if is_open {
            let tag_end = match html[pos..].find('>') {
                Some(gt) => pos + gt + 1,
                None => {
                    // Malformed tag with no `>`: the remainder is literal text.
                    if let Some(top) = stack.last_mut() {
                        top.interior.push_str(&html[pos..]);
                    } else {
                        out.push_str(&html[pos..]);
                    }
                    break;
                },
            };
            stack.push(CalloutFrame {
                open_pos: pos,
                open_end: tag_end,
                interior: String::new(),
            });
            cursor = tag_end;
            oi += 1;
        } else {
            ci += 1;
            if let Some(frame) = stack.pop() {
                let transformed = transform_callout_block(html, &frame);
                if let Some(top) = stack.last_mut() {
                    top.interior.push_str(&transformed);
                } else {
                    out.push_str(&transformed);
                }
                cursor = pos + "</blockquote>".len();
            }
            // An unmatched close is left in place as literal text.
        }
    }

    // Flush the trailing text, then emit any unclosed (raw HTML) blockquotes verbatim.
    if let Some(top) = stack.last_mut() {
        top.interior.push_str(&html[cursor..]);
    } else {
        out.push_str(&html[cursor..]);
    }
    while let Some(frame) = stack.pop() {
        let mut verbatim = String::new();
        verbatim.push_str(&html[frame.open_pos..frame.open_end]);
        verbatim.push_str(&frame.interior);
        if let Some(top) = stack.last_mut() {
            top.interior.push_str(&verbatim);
        } else {
            out.push_str(&verbatim);
        }
    }

    out
}

/// An open `<blockquote>` whose interior is being accumulated. Nested
/// blockquotes are transformed and appended to `interior` before the frame
/// itself is closed.
struct CalloutFrame {
    open_pos: usize,
    open_end: usize,
    interior: String,
}

/// Detected callout structure inside a matched blockquote frame.
struct CalloutData {
    class: &'static str,
    title: &'static str,
    attrs: String,
    first_tag: usize,
    p_tag_end: usize,
    content_end: usize,
    marker_end: usize,
}

/// Detects the callout marker in a blockquote frame's first paragraph.
fn detect_callout(html: &str, frame: &CalloutFrame) -> Option<CalloutData> {
    let interior = &frame.interior;
    let first_tag = interior.find('<')?;
    if interior[first_tag..].starts_with("<blockquote") || !interior[first_tag..].starts_with("<p")
    {
        return None;
    }
    let p_tag_end = first_tag + interior[first_tag..].find('>')?;
    let content_start = p_tag_end + 1;
    let content_end = content_start + interior[content_start..].find("</p>")?;

    let marker = CALLOUT_REGEX.captures(&interior[content_start..content_end])?;
    let marker_match = marker.get(0)?;
    let (class, title) = callout_style(marker.get(1)?.as_str());

    let tag_end = frame.open_pos + html[frame.open_pos..].find('>')?;
    let attrs = html[frame.open_pos + "<blockquote".len()..tag_end].to_string();

    Some(CalloutData {
        class,
        title,
        attrs,
        first_tag,
        p_tag_end,
        content_end,
        marker_end: content_start + marker_match.end(),
    })
}

/// Emits a single blockquote from its frame: either the callout `<div>`, or the
/// original `<blockquote>` with any nested callouts already transformed.
fn transform_callout_block(html: &str, frame: &CalloutFrame) -> String {
    match detect_callout(html, frame) {
        Some(callout) => {
            let interior = &frame.interior;
            let mut out = String::new();
            out.push_str(&format!(
                r#"<div class="callout callout-{}"{}<p class="callout-title">{}<span class="callout-title-text">{}</span></p>"#,
                callout.class,
                callout.attrs,
                callout_icon(callout.class),
                callout.title
            ));
            out.push_str(&interior[..callout.first_tag]);

            if !interior[callout.marker_end..callout.content_end]
                .trim()
                .is_empty()
            {
                out.push_str(&interior[callout.first_tag..callout.p_tag_end + 1]);
                out.push_str(&interior[callout.marker_end..callout.content_end]);
                out.push_str("</p>");
            }

            out.push_str(&interior[callout.content_end + "</p>".len()..]);
            out.push_str("</div>");
            out
        },
        None => {
            let mut out = String::new();
            out.push_str(&html[frame.open_pos..frame.open_end]);
            out.push_str(&frame.interior);
            out.push_str("</blockquote>");
            out
        },
    }
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
    fn raw_html_blockquote_does_not_break_callout_transform() {
        let doc = "\
<blockquote>raw html that is never closed\n\
\n\
> [!NOTE]\n\
> First note.\n\
\n\
> [!TIP]\n\
> Second tip.\n";
        let html = render_gfm(doc);
        assert!(
            html.contains(r#"<div class="callout callout-note""#),
            "note callout should transform, got: {html}"
        );
        assert!(
            html.contains(r#"<div class="callout callout-tip""#),
            "tip callout should transform, got: {html}"
        );
        assert_eq!(html.matches("class=\"callout-icon\"").count(), 2);
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

    #[test]
    fn transforms_callout_nested_inside_a_callout() {
        let html = render_gfm("> [!NOTE]\n> Outer note.\n>\n> > [!TIP]\n> > Inner tip.\n");
        assert!(
            html.contains(r#"<div class="callout callout-note""#),
            "outer callout missing: {html}"
        );
        assert!(
            html.contains(r#"<div class="callout callout-tip""#),
            "inner callout missing: {html}"
        );
        assert_eq!(
            html.matches("class=\"callout-icon\"").count(),
            2,
            "html was: {html}"
        );
        assert!(html.contains("Outer note."), "html was: {html}");
        assert!(html.contains("Inner tip."), "html was: {html}");
        assert!(
            !html.contains("[!NOTE]"),
            "outer marker should be stripped: {html}"
        );
        assert!(
            !html.contains("[!TIP]"),
            "inner marker should be stripped: {html}"
        );
        assert!(
            !html.contains("<blockquote"),
            "all callout blockquotes should be transformed: {html}"
        );
    }

    #[test]
    fn transforms_callout_nested_inside_a_plain_blockquote() {
        let html = render_gfm("> plain\n> > [!NOTE]\n> > Nested note.\n");
        assert!(
            html.contains(r#"<div class="callout callout-note""#),
            "nested callout missing: {html}"
        );
        assert!(html.contains("<blockquote"), "outer quote kept: {html}");
        assert!(
            !html.contains("[!NOTE]"),
            "marker should be stripped: {html}"
        );
    }
}
