pub mod config;
pub mod formatter;
pub mod renderer;
pub mod toc;

use comrak::Anchorizer;
use comrak::nodes::{AstNode, NodeValue};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct HeadingEntry {
    pub level: u8,
    pub text: String,
    pub anchor_id: String,
}

pub(crate) fn collect_heading_text<'a>(node: &'a AstNode<'a>) -> String {
    let mut text = String::new();
    for child in node.children() {
        match &child.data.borrow().value {
            NodeValue::Text(t) => text.push_str(t.as_ref()),
            NodeValue::Code(c) => text.push_str(&c.literal),
            _ => text.push_str(&collect_heading_text(child)),
        }
    }
    text
}

pub(crate) fn extract_headings_from_ast<'a>(
    root: &'a AstNode<'a>,
    anchorizer: &mut Anchorizer,
) -> Vec<HeadingEntry> {
    root.descendants()
        .filter_map(|node| {
            if let NodeValue::Heading(heading) = &node.data.borrow().value {
                let text = collect_heading_text(node);
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
