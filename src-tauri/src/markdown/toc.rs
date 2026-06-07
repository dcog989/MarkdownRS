use comrak::nodes::{AstNode, NodeValue};
use comrak::{Anchorizer, Arena, parse_document};
use regex::Regex;
use std::sync::LazyLock;

use crate::markdown::config::MarkdownFlavor;

static TOC_START_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<!--\s*toc\s*-->").expect("Invalid TOC_START_RE"));
static TOC_END_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<!--\s*(?:tocstop|/toc)\s*-->").expect("Invalid TOC_END_RE"));
static H1_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^#[\t ].*$").expect("Invalid H1_RE"));

#[derive(Debug)]
struct TocEntry {
    level: u8,
    text: String,
    anchor_id: String,
}

fn extract_headings(content: &str) -> Vec<TocEntry> {
    let flavor = MarkdownFlavor::default().to_comrak_options();
    let arena = Arena::new();
    let root = parse_document(&arena, content, &flavor);

    let mut anchorizer = Anchorizer::new();
    root.descendants()
        .filter_map(|node| {
            if let NodeValue::Heading(heading) = &node.data.borrow().value {
                let text = collect_text(node);
                let anchor_id = anchorizer.anchorize(&text);
                Some(TocEntry {
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

fn collect_text<'a>(node: &'a AstNode<'a>) -> String {
    let mut text = String::new();
    for child in node.children() {
        match &child.data.borrow().value {
            NodeValue::Text(t) => text.push_str(t.as_ref()),
            NodeValue::Code(c) => text.push_str(&c.literal),
            _ => text.push_str(&collect_text(child)),
        }
    }
    text
}

fn generate_toc_markdown(entries: &[TocEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    let mut lines: Vec<String> = Vec::new();
    for entry in entries {
        let indent = "  ".repeat((entry.level as usize).saturating_sub(1));
        lines.push(format!(
            "{}- [{}](#{})",
            indent, entry.text, entry.anchor_id
        ));
    }
    lines.join("\n")
}

fn find_after_first_h1(content: &str) -> usize {
    if let Some(m) = H1_RE.find(content) {
        let after = m.end();
        if after < content.len() {
            let rest = &content[after..];
            let skip = rest
                .chars()
                .take_while(|c| *c == '\n' || *c == '\r')
                .count();
            after + skip
        } else {
            after
        }
    } else {
        0
    }
}

fn replace_toc_region(content: &str, toc_markdown: &str) -> String {
    let start = TOC_START_RE.find(content);

    match start {
        Some(start_match) => {
            let end = TOC_END_RE.find_at(content, start_match.end());
            match end {
                Some(end_match) => {
                    let before = &content[..start_match.end()];
                    let after = &content[end_match.start()..];
                    format!("{}\n\n{}\n\n{}", before, toc_markdown, after)
                },
                None => {
                    let before = &content[..start_match.end()];
                    let after = &content[start_match.end()..]
                        .trim_start_matches(|c| c == '\n' || c == '\r');
                    format!(
                        "{}\n\n{}\n\n<!-- tocstop -->\n\n{}",
                        before, toc_markdown, after
                    )
                },
            }
        },
        None => {
            let insert_at = find_after_first_h1(content);
            let (before, after) = content.split_at(insert_at);
            let before = before.trim_end_matches(|c| c == '\n' || c == '\r');
            format!(
                "{}\n\n<!-- toc -->\n\n{}\n\n<!-- tocstop -->\n\n{}",
                before, toc_markdown, after
            )
        },
    }
}

pub fn generate_document_toc(content: &str) -> String {
    if content.trim().is_empty() {
        return content.to_string();
    }

    let entries = extract_headings(content);
    if entries.is_empty() {
        return content.to_string();
    }

    let toc_markdown = generate_toc_markdown(&entries);
    replace_toc_region(content, &toc_markdown)
}
