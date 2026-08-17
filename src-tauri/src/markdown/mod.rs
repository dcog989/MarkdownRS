pub mod callouts;
pub mod config;
pub mod formatter_rumdl;
pub mod frontmatter;
pub mod harper;
pub mod linkify;
pub mod linter;
pub mod metrics;
pub mod renderer;
pub mod toc;

use comrak::nodes::{AstNode, NodeValue};
use comrak::{Anchorizer, Arena, parse_document};
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
    extract_headings_from_ast(root, &mut Anchorizer::new())
}

pub(crate) fn extract_headings_from_ast<'a>(
    root: &'a AstNode<'a>,
    anchorizer: &mut Anchorizer,
) -> Vec<HeadingEntry> {
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
    out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
}
