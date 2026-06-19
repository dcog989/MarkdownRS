use regex::Regex;
use std::sync::LazyLock;

use crate::markdown::{HeadingEntry, config::MarkdownFlavor, parse_headings};

static TOC_START_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<!--\s*toc\s*-->").expect("Invalid TOC_START_RE"));
static TOC_END_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<!--\s*(?:tocstop|/toc)\s*-->").expect("Invalid TOC_END_RE"));
static H1_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^#[\t ].*$").expect("Invalid H1_RE"));

fn extract_headings(content: &str) -> Vec<HeadingEntry> {
    parse_headings(content, MarkdownFlavor::default())
}

fn generate_toc_markdown(entries: &[HeadingEntry]) -> String {
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
                    let after = &content[start_match.end()..].trim_start_matches(['\n', '\r']);
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
            let before = before.trim_end_matches(['\n', '\r']);
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
