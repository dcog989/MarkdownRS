pub mod callouts;
pub mod config;
pub mod formatter_rumdl;
pub mod frontmatter;
pub mod harper;
pub mod linkify;
pub mod linter;
pub mod renderer;
pub mod toc;

use comrak::nodes::{AstNode, NodeValue};
use comrak::{Anchorizer, Arena, html::escape_href, parse_document};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct HeadingEntry {
    pub level: u8,
    pub text: String,
    pub anchor_id: String,
}

pub(crate) fn parse_headings(content: &str, flavor: config::MarkdownFlavor) -> Vec<HeadingEntry> {
    let comrak_options = flavor.to_comrak_options();
    let arena = Arena::new();
    let root = parse_document(&arena, content, &comrak_options);
    extract_headings_from_ast(root)
}

pub(crate) fn extract_headings_from_ast<'a>(root: &'a AstNode<'a>) -> Vec<HeadingEntry> {
    let mut anchorizer = Anchorizer::new();
    reserve_written_ids(root, &mut anchorizer);

    root.descendants()
        .filter_map(|node| {
            if let NodeValue::Heading(heading) = &node.data.borrow().value {
                // The anchor must derive from comrak's `collect_text` — the
                // exact extraction the HTML renderer uses for `id` generation
                // (`html.rs` render_heading) — so TOC links match the rendered
                // heading. The display text is extracted separately so raw-HTML
                // spans (e.g. the anchors linkify injects) keep their labels.
                let anchor_id = anchorizer.anchorize(&node.collect_text());
                let text = collect_heading_display_text(node);
                Some(HeadingEntry {
                    level: heading.level,
                    text,
                    anchor_id,
                })
            } else {
                None
            }
        })
        .collect()
}

fn href_escaped(value: &str) -> String {
    let mut out = String::new();
    escape_href(&mut out, value, false).expect("writing to a String cannot fail");
    out
}

/// Reserves the IDs comrak writes before anchorizing headings, mirroring
/// `reserve_written_ids` in its HTML renderer for the extensions enabled here
/// (footnotes). Without this, a heading whose slug matches a footnote ID takes
/// the footnote's anchor and the generated link points nowhere.
///
/// `Anchorizer::reserve` is crate-private, so `anchorize` doubles as the
/// reservation: canonical slugs are inserted verbatim, and a slug that gets
/// rewritten can never collide with a heading slug in the first place.
fn reserve_written_ids<'a>(root: &'a AstNode<'a>, anchorizer: &mut Anchorizer) {
    let mut probe = Anchorizer::new();
    for node in root.descendants() {
        let reserved = match &node.data.borrow().value {
            NodeValue::FootnoteDefinition(definition) => format!("fn-{}", href_escaped(&definition.name)),
            NodeValue::FootnoteReference(reference) if reference.ref_num > 1 => {
                format!("fnref-{}-{}", href_escaped(&reference.name), reference.ref_num)
            },
            NodeValue::FootnoteReference(reference) => format!("fnref-{}", href_escaped(&reference.name)),
            _ => continue,
        };
        if probe.anchorize(&reserved) == reserved {
            anchorizer.anchorize(&reserved);
        }
    }
}

/// Visible text of a heading: like comrak's `collect_text`, but raw-HTML
/// inline spans (`HtmlInline`) contribute their tag-stripped content instead
/// of nothing. Linkify emits wikilink/file-path links as such spans, so their
/// labels appear in heading text / TOC entries instead of being truncated away.
fn collect_heading_display_text<'a>(node: &'a AstNode<'a>) -> String {
    let mut text = String::new();
    collect_heading_display_text_into(node, &mut text);
    text
}

fn collect_heading_display_text_into<'a>(node: &'a AstNode<'a>, out: &mut String) {
    match &node.data.borrow().value {
        NodeValue::Text(t) => out.push_str(t.as_ref()),
        NodeValue::Code(c) => out.push_str(&c.literal),
        NodeValue::Math(m) => out.push_str(&m.literal),
        NodeValue::LineBreak | NodeValue::SoftBreak => out.push(' '),
        NodeValue::HtmlInline(html) => out.push_str(&html_text_content(html)),
        _ => {
            for child in node.children() {
                collect_heading_display_text_into(child, out);
            }
        },
    }
}

/// Text content of an HTML fragment: everything between tags, with the basic
/// entities unescaped. Used to recover link labels from the HtmlInline spans
/// linkify injects.
///
/// `&amp;` is decoded last so `&amp;lt;` yields the literal `&lt;` instead of
/// being decoded twice into `<`.
fn html_text_content(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {},
            _ => out.push(c),
        }
    }
    out.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_text_content_decodes_entities_once() {
        assert_eq!(html_text_content("&amp;lt;"), "&lt;");
        assert_eq!(html_text_content("&amp;amp;"), "&amp;");
        assert_eq!(html_text_content("<b>a &amp; b</b>"), "a & b");
    }

    #[test]
    fn heading_anchor_avoids_footnote_id_collision() {
        let result = crate::markdown::renderer::render_markdown(
            "# fn-1\n\nText[^1]\n\n[^1]: note\n",
            crate::markdown::renderer::MarkdownOptions {
                flavor: config::MarkdownFlavor::Gfm,
                ..Default::default()
            },
        )
        .expect("render should succeed");

        assert_eq!(result.headings[0].anchor_id, "fn-1-1", "html was {}", result.html);
        assert!(result.html.contains(r#"<h1 id="fn-1-1""#), "html was {}", result.html);
        assert!(result.html.contains(r#"id="fn-1""#), "html was {}", result.html);
    }
}
