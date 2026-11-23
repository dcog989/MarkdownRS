//! Inline icons for Obsidian-style callout titles.
//!
//! comrak's `ofm_callouts` extension parses the callouts and emits their
//! markup, but it has no hook for the title icon, so the SVGs are injected
//! into the rendered HTML afterwards.

/// Opening of the callout `<div>` comrak writes, up to the start of the type.
const CALLOUT_OPEN: &str = r#"<div class="callout" data-callout=""#;
/// Opening of the title `<div>` comrak writes (optionally followed by
/// `data-sourcepos`).
const TITLE_OPEN: &str = r#"<div class="callout-title""#;

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
        "caution" => "<path d=\"M7.9 2h8.2L22 7.9v8.2l-5.9 5.9H7.9L2 16.1V7.9z\"/><path d=\"M12 8v4M12 16h.01\"/>",
        _ => "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4M12 8h.01\"/>",
    };
    format!(r#"<svg {attrs}>{inner}</svg>"#)
}

/// Inserts each callout's icon as the first child of its title `<div>`.
///
/// A callout div is only recognised when comrak's title div follows its opening
/// tag directly, so raw HTML that happens to use the same classes is left alone.
pub(super) fn inject_icons(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut rest = html;

    while let Some(open) = rest.find(CALLOUT_OPEN) {
        let type_start = open + CALLOUT_OPEN.len();
        let (Some(quote), Some(tag_end)) = (
            rest[type_start..].find('"').map(|i| type_start + i),
            rest[open..].find('>').map(|i| open + i + 1),
        ) else {
            break;
        };

        let after = &rest[tag_end..];
        let lead = after.len() - after.trim_start().len();
        if !after[lead..].starts_with(TITLE_OPEN) {
            out.push_str(&rest[..tag_end]);
            rest = after;
            continue;
        }

        let title_start = tag_end + lead;
        let Some(title_end) = rest[title_start..].find('>').map(|i| title_start + i + 1) else {
            break;
        };

        out.push_str(&rest[..title_end]);
        out.push_str(&callout_icon(&rest[type_start..quote]));
        rest = &rest[title_end..];
    }

    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use crate::markdown::{config::MarkdownFlavor, renderer::MarkdownOptions};

    fn render_gfm(content: &str) -> String {
        crate::markdown::renderer::render_markdown(
            content,
            MarkdownOptions {
                flavor: MarkdownFlavor::Gfm,
                ..Default::default()
            },
        )
        .expect("render should succeed")
        .html
    }

    #[test]
    fn injects_icon_into_callout_title() {
        let html = render_gfm("> [!NOTE]\n> Some note with **bold** text.\n");
        assert!(html.contains(r#"<div class="callout" data-callout="note""#), "{html}");
        assert!(html.contains("class=\"callout-icon\""), "{html}");
        assert!(html.contains("Some note with <strong"), "{html}");
        assert!(!html.contains("[!NOTE]"), "{html}");
        assert!(!html.contains("<blockquote"), "{html}");
    }

    #[test]
    fn title_starts_with_icon() {
        let html = render_gfm("> [!tip]\n> Body.\n");
        let title = html.find(r#"<div class="callout-title""#).expect("title missing");
        let icon = html.find(r#"<svg class="callout-icon""#).expect("icon missing");
        assert!(icon > title, "{html}");
        assert!(html[title..icon].ends_with('>'), "{html}");
        assert!(html.contains("Tip"), "{html}");
    }

    #[test]
    fn callout_with_list_body() {
        let html = render_gfm("> [!CAUTION]\n> - item one\n> - item two\n");
        assert!(html.contains(r#"data-callout="caution""#), "{html}");
        assert!(html.contains("<li"), "{html}");
        assert!(html.contains("item one"), "{html}");
    }

    #[test]
    fn custom_title_text_becomes_the_title() {
        let html = render_gfm("> [!WARNING] Careful now\n> more text\n");
        assert!(html.contains(r#"data-callout="warning""#), "{html}");
        assert!(html.contains("Careful now"), "{html}");
        assert!(html.contains("more text"), "{html}");
        assert!(!html.contains("[!WARNING]"), "{html}");
    }

    #[test]
    fn regular_blockquotes_untouched() {
        let html = render_gfm("> regular quote\n> with two lines\n");
        assert!(html.contains("<blockquote"), "{html}");
        assert!(!html.contains("callout"), "{html}");
    }

    #[test]
    fn unknown_types_get_default_icon() {
        let html = render_gfm("> [!CUSTOM] Custom title\n> not a box\n");
        assert!(html.contains(r#"data-callout="custom""#), "{html}");
        assert_eq!(html.matches("class=\"callout-icon\"").count(), 1, "{html}");
    }

    #[test]
    fn callout_still_transforms_after_raw_html() {
        let doc = "\
<blockquote>raw html that is never closed\n\
\n\
> [!NOTE]\n\
> First note.\n\
\n\
> [!TIP]\n\
> Second tip.\n";
        let html = render_gfm(doc);
        assert!(html.contains(r#"data-callout="note""#), "{html}");
        assert!(html.contains(r#"data-callout="tip""#), "{html}");
        assert_eq!(html.matches("class=\"callout-icon\"").count(), 2, "{html}");
    }

    #[test]
    fn nested_callouts_both_get_icons() {
        let html = render_gfm("> [!NOTE]\n> Outer note.\n>\n> > [!TIP]\n> > Inner tip.\n");
        assert!(html.contains(r#"data-callout="note""#), "{html}");
        assert!(html.contains(r#"data-callout="tip""#), "{html}");
        assert_eq!(html.matches("class=\"callout-icon\"").count(), 2, "{html}");
        assert!(html.contains("Outer note."), "{html}");
        assert!(html.contains("Inner tip."), "{html}");
        assert!(!html.contains("[!NOTE]"), "{html}");
    }

    #[test]
    fn callout_nested_inside_plain_blockquote() {
        let html = render_gfm("> plain\n> > [!NOTE]\n> > Nested note.\n");
        assert!(html.contains(r#"data-callout="note""#), "{html}");
        assert!(html.contains("<blockquote"), "{html}");
        assert!(!html.contains("[!NOTE]"), "{html}");
    }

    #[test]
    fn icon_lands_after_sourcepos_attribute() {
        let html = super::inject_icons(
            "<div class=\"callout\" data-callout=\"note\" data-callout-fold=\"none\">\n\
             <div class=\"callout-title\" data-sourcepos=\"1:3-1:10\">Note</div>\n\
             </div>\n",
        );
        assert!(
            html.contains("data-sourcepos=\"1:3-1:10\"><svg class=\"callout-icon\""),
            "{html}"
        );
    }

    #[test]
    fn raw_html_callout_div_is_not_touched() {
        let html = super::inject_icons(
            "<div class=\"callout\" data-callout=\"note\">raw</div>\n\
             <div class=\"callout\" data-callout=\"tip\" data-callout-fold=\"none\">\n\
             <div class=\"callout-title\">Tip</div>\n\
             </div>\n",
        );
        assert_eq!(html.matches("class=\"callout-icon\"").count(), 1, "{html}");
        assert!(
            html.contains("<div class=\"callout\" data-callout=\"note\">raw</div>"),
            "{html}"
        );
    }

    #[test]
    fn html_without_callouts_is_unchanged() {
        let html = "<p>no callouts here</p>\n";
        assert_eq!(super::inject_icons(html), html);
    }
}
