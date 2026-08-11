pub mod callouts;
pub mod config;
pub mod formatter_rumdl;
pub mod frontmatter;
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
                // comrak's `collect_text` is the same extraction the HTML
                // renderer uses for `id` generation (`html.rs` render_heading),
                // so the reported text and anchor always match the rendered
                // heading. A bespoke traversal here would diverge for inline
                // math (dropped entirely) and produce broken TOC anchors.
                let text = node.collect_text();
                let anchor_id = anchorizer.anchorize(&text);
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
