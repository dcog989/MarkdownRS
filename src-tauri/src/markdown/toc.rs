use regex::Regex;
use std::sync::LazyLock;

use crate::markdown::{HeadingEntry, config::MarkdownFlavor, frontmatter, parse_headings};

static TOC_START_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<!--\s*toc\s*-->").expect("Invalid TOC_START_RE"));
static TOC_END_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<!--\s*(?:tocstop|/toc)\s*-->").expect("Invalid TOC_END_RE"));
static H1_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^#[\t ].*$").expect("Invalid H1_RE"));

/// Leading whitespace (in bytes; a leading tab counts as 1) that makes a line
/// an indented code block.
const INDENTED_CODE_INDENT: usize = 4;

/// Per-line view of `content` (split on `\n`) with code tracking.
/// `code[i]` is true when line `i` holds code (fenced or indented), so TOC
/// markers and heading anchors are never picked up from code examples that
/// happen to contain `# ...` or `<!-- toc -->` text.
struct LineMap {
    starts: Vec<usize>,
    ends: Vec<usize>,
    code: Vec<bool>,
}

impl LineMap {
    fn new(content: &str) -> Self {
        let mut starts = Vec::new();
        let mut ends = Vec::new();
        let mut offset = 0;
        for line in content.split_inclusive('\n') {
            starts.push(offset);
            offset += line.len();
            ends.push(offset);
        }
        if content.is_empty() {
            return Self {
                starts,
                ends,
                code: Vec::new(),
            };
        }
        Self {
            starts,
            ends,
            code: mark_code_lines(content),
        }
    }

    /// Index of the line containing `offset`.
    fn line_at(&self, offset: usize) -> usize {
        let line_starts = &self.starts[..self.ends.len()];
        match line_starts.binary_search(&offset) {
            Ok(i) => i,
            Err(i) => i.saturating_sub(1),
        }
    }
}

/// Marks lines that hold code: fenced blocks and indented blocks. TOC markers
/// inside a code sample are then never treated as real markers.
///
/// A fence is CommonMark-style: 3+ identical backtick or tilde characters at up
/// to 3 spaces of indentation; the closing fence must use the same character
/// with at least the opening length and carry no info string. The opening and
/// closing fence lines themselves are not flagged. An indented code line is 4+ spaces at the start
/// of a block (after a blank line or another code line), which also covers the
/// first line of a `    <!-- toc -->` sample.
fn mark_code_lines(content: &str) -> Vec<bool> {
    let mut code = Vec::new();
    let mut open: Option<(char, usize)> = None;
    let mut prev_blank = true;
    let mut prev_code = false;
    for line in content.split_inclusive('\n') {
        let in_fence = open.is_some();
        let stripped = line.trim_start_matches(['\r', '\n']).trim_start();
        let indent = line.len() - stripped.len();
        let indented = !in_fence && indent >= INDENTED_CODE_INDENT && (prev_blank || prev_code);
        let is_code = in_fence || indented;
        code.push(is_code);

        if indent < INDENTED_CODE_INDENT
            && let Some((first, len, rest)) = fence_run(stripped)
        {
            match open {
                Some((fence_char, min_len)) if fence_char == first && len >= min_len && rest.trim().is_empty() => {
                    open = None;
                },
                None => {
                    open = Some((first, len));
                },
                _ => {},
            }
        }

        prev_blank = stripped.is_empty();
        prev_code = is_code;
    }
    code
}

/// The fence character, run length and trailing text when `line` opens or
/// closes a fence. A closing fence has only whitespace after the run, so the
/// trailing text tells the caller whether this can close an open fence.
fn fence_run(line: &str) -> Option<(char, usize, &str)> {
    let first = line.chars().next()?;
    if first != '`' && first != '~' {
        return None;
    }
    let len = line.chars().take_while(|&c| c == first).count();
    (len >= 3).then_some((first, len, &line[len..]))
}

fn extract_headings(content: &str) -> Vec<HeadingEntry> {
    parse_headings(content, MarkdownFlavor::default())
}

/// Escapes the characters that would otherwise break a `[label](#anchor)` link.
fn escape_link_label(text: &str) -> String {
    text.replace('\\', "\\\\").replace('[', "\\[").replace(']', "\\]")
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
            indent,
            escape_link_label(&entry.text),
            entry.anchor_id
        ));
    }
    lines.join("\n")
}

/// Byte offset just past the first ATX H1 heading outside a code block
/// (plus any following blank lines), or `0` when there is no such heading.
fn find_after_first_h1(content: &str, lines: &LineMap) -> usize {
    for i in 0..lines.code.len() {
        if lines.code[i] {
            continue;
        }
        if H1_RE.is_match(&content[lines.starts[i]..lines.ends[i]]) {
            let after = lines.ends[i];
            let skip = content[after..]
                .chars()
                .take_while(|c| *c == '\n' || *c == '\r')
                .count();
            return after + skip;
        }
    }
    0
}

/// True when `offset` points into a code line or an inline code span.
fn is_in_code(content: &str, lines: &LineMap, offset: usize) -> bool {
    let index = lines.line_at(offset);
    if lines.code[index] {
        return true;
    }
    inside_inline_code(
        &content[lines.starts[index]..lines.ends[index]],
        offset - lines.starts[index],
    )
}

/// True when `offset` lies inside an inline code span opened and closed on the
/// same line. A span opens with a backtick run and closes with the next run of
/// the same length, so `` `<!-- toc -->` `` is text, not a marker.
///
/// shortcut: only same-line spans are checked; a span opened on an earlier line
/// does not hide a marker, upgrade if multi-line code spans need to be skipped.
fn inside_inline_code(line: &str, offset: usize) -> bool {
    let runs = backtick_runs(line);
    let mut i = 0;
    while i < runs.len() {
        let (open, len) = runs[i];
        match runs[i + 1..].iter().position(|&(_, other)| other == len) {
            Some(relative) => {
                let close = runs[i + 1 + relative].0;
                if offset > open && offset < close {
                    return true;
                }
                i += relative + 2;
            },
            None => i += 1,
        }
    }
    false
}

/// `(byte offset, run length)` of every backtick run on the line.
fn backtick_runs(line: &str) -> Vec<(usize, usize)> {
    let bytes = line.as_bytes();
    let mut runs = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'`' {
            let start = i;
            while i < bytes.len() && bytes[i] == b'`' {
                i += 1;
            }
            runs.push((start, i - start));
        } else {
            i += 1;
        }
    }
    runs
}

/// First match of `re` that lies outside code.
fn find_marker_on_line<'a>(content: &'a str, lines: &LineMap, re: &Regex) -> Option<regex::Match<'a>> {
    re.find_iter(content).find(|m| !is_in_code(content, lines, m.start()))
}

/// First match of `re` at or after `from` that lies outside code.
fn find_marker_on_line_after<'a>(
    content: &'a str,
    lines: &LineMap,
    re: &Regex,
    from: usize,
) -> Option<regex::Match<'a>> {
    re.find_iter(content)
        .find(|m| m.start() >= from && !is_in_code(content, lines, m.start()))
}

fn replace_toc_region(content: &str, toc_markdown: &str) -> String {
    let lines = LineMap::new(content);
    let start = find_marker_on_line(content, &lines, &TOC_START_RE);

    match start {
        Some(start_match) => {
            let end = find_marker_on_line_after(content, &lines, &TOC_END_RE, start_match.end());
            match end {
                Some(end_match) => {
                    let before = &content[..start_match.end()];
                    let after = &content[end_match.start()..];
                    if toc_markdown.is_empty() {
                        format!("{}\n\n{}", before, after)
                    } else {
                        format!("{}\n\n{}\n\n{}", before, toc_markdown, after)
                    }
                },
                None => {
                    let before = &content[..start_match.end()];
                    let after = &content[start_match.end()..].trim_start_matches(['\n', '\r']);
                    if toc_markdown.is_empty() {
                        format!("{}\n\n<!-- tocstop -->\n\n{}", before, after)
                    } else {
                        format!("{}\n\n{}\n\n<!-- tocstop -->\n\n{}", before, toc_markdown, after)
                    }
                },
            }
        },
        None => {
            // Without headings there is nothing to insert; only an existing
            // region (handled above) is cleared.
            if toc_markdown.is_empty() {
                return content.to_string();
            }
            let insert_at = find_after_first_h1(content, &lines);
            let (before, after) = content.split_at(insert_at);
            let before = before.trim_end_matches(['\n', '\r']);
            format!(
                "{}\n\n<!-- toc -->\n\n{}\n\n<!-- tocstop -->\n\n{}",
                before, toc_markdown, after
            )
        },
    }
}

/// Inserts a TOC generated from the given headings into `content`.
/// No markdown parsing happens here; the caller supplies headings already
/// extracted (e.g. by `render_markdown`), so no redundant comrak parse occurs.
/// With no headings an existing region is emptied instead of left stale.
fn insert_toc(content: &str, entries: &[HeadingEntry]) -> String {
    replace_toc_region(content, &generate_toc_markdown(entries))
}

/// Runs `insert` on `content` with any leading frontmatter blanked out, then
/// restores the original frontmatter block. Blanking keeps frontmatter content
/// (e.g. `#` comments inside YAML) from being chosen as the TOC insertion
/// anchor, which would corrupt the block.
fn insert_toc_around_frontmatter(content: &str, insert: impl FnOnce(&str) -> String) -> String {
    let frontmatter = frontmatter::extract_frontmatter(content);
    let body = frontmatter
        .map(|fm| frontmatter::blank_out(content, &fm))
        .unwrap_or_else(|| content.to_string());

    let result = insert(&body);

    match frontmatter {
        Some(fm) => {
            let blanked = "\n".repeat(fm.line_count);
            if let Some(rest) = result.strip_prefix(&blanked) {
                format!("{}{}", &content[..fm.end_offset], rest)
            } else {
                format!("{}{}", &content[..fm.end_offset], result)
            }
        },
        None => result,
    }
}

pub fn generate_document_toc(content: &str) -> String {
    if content.trim().is_empty() {
        return content.to_string();
    }

    insert_toc_around_frontmatter(content, |body| {
        let entries = extract_headings(body);
        insert_toc(body, &entries)
    })
}

/// Like [`generate_document_toc`], but reuses headings provided by the caller
/// (typically the `headings` already produced by `render_markdown`) instead of
/// re-parsing the document. Falls back to a full parse when `headings` is `None`.
pub fn generate_document_toc_with_headings(content: &str, headings: Option<Vec<HeadingEntry>>) -> String {
    match headings {
        Some(entries) => insert_toc_around_frontmatter(content, |body| insert_toc(body, &entries)),
        None => generate_document_toc(content),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_content_is_returned_unchanged() {
        assert_eq!(generate_document_toc(""), "");
        assert_eq!(generate_document_toc("  \n  "), "  \n  ");
    }

    #[test]
    fn content_without_headings_is_returned_unchanged() {
        let content = "Just a paragraph.\n\nAnother one.";
        assert_eq!(generate_document_toc(content), content);
    }

    #[test]
    fn inserts_toc_after_the_first_h1() {
        let content = "# Main Title\n\nIntro text.\n\n## Section One\n\nBody.\n\n## Section Two\n\nMore.";
        let result = generate_document_toc(content);

        assert!(result.contains("<!-- toc -->"));
        assert!(result.contains("<!-- tocstop -->"));
        assert!(result.starts_with("# Main Title\n\n<!-- toc -->"));
        assert!(result.contains("- [Section One](#section-one)"));
        assert!(result.contains("- [Section Two](#section-two)"));
    }

    #[test]
    fn replaces_an_existing_toc_region() {
        let content = "# Title\n\n<!-- toc -->\n\n- [Stale](#stale)\n\n<!-- tocstop -->\n\n## Real\n\nBody.";
        let result = generate_document_toc(content);

        assert!(!result.contains("Stale"));
        assert!(result.contains("- [Real](#real)"));
        assert_eq!(result.matches("<!-- toc -->").count(), 1);
        assert_eq!(result.matches("<!-- tocstop -->").count(), 1);
    }

    #[test]
    fn appends_tocstop_when_the_start_marker_has_no_end() {
        let content = "# Title\n\n<!-- toc -->\n\nContent.\n\n## Heading\n\nBody.";
        let result = generate_document_toc(content);

        assert!(result.contains("<!-- tocstop -->"));
        assert!(result.contains("- [Heading](#heading)"));
    }

    #[test]
    fn nests_bullets_by_heading_level() {
        let content = "# Title\n\n## H2\n\n### H3\n\nBody.";
        let result = generate_document_toc(content);

        assert!(result.contains("- [H2](#h2)"));
        assert!(result.contains("  - [H3](#h3)"));
    }

    #[test]
    fn anchorizes_heading_text() {
        let content = "# Title\n\n## Some Heading With Words\n\nBody.";
        let result = generate_document_toc(content);

        assert!(result.contains("- [Some Heading With Words](#some-heading-with-words)"));
    }

    #[test]
    fn find_after_first_h1_skips_trailing_newlines() {
        let content = "# Title\n\n\n## Next";
        let lines = LineMap::new(content);
        let pos = find_after_first_h1(content, &lines);
        assert_eq!(&content[pos..], "## Next");
        assert_eq!(&content[pos - 1..pos], "\n");
    }

    #[test]
    fn h1_inside_fenced_code_is_not_the_toc_anchor() {
        let content = "```\n# not a heading\n```\n\n# Real Title\n\n## Section\n\nBody.";
        let result = generate_document_toc(content);

        assert!(
            result.starts_with("```\n# not a heading\n```\n\n# Real Title\n\n<!-- toc -->"),
            "TOC must be inserted after the real H1, outside the fence: {result}"
        );
        assert!(result.contains("- [Real Title](#real-title)"));
        assert!(result.contains("- [Section](#section)"));
        assert!(
            !result.contains("- [not a heading]"),
            "fenced-code heading must not appear as a TOC entry: {result}"
        );
    }

    #[test]
    fn toc_markers_inside_fenced_code_are_ignored() {
        let content = "```\n<!-- toc -->\n<!-- tocstop -->\n```\n\n# Title\n\n## Section\n\nBody.";
        let result = generate_document_toc(content);

        // The fenced markers are code, not TOC markers: a fresh region is
        // inserted after the first real heading.
        assert!(
            result.starts_with("```\n<!-- toc -->\n<!-- tocstop -->\n```\n\n# Title\n\n<!-- toc -->"),
            "html was: {result}"
        );
        assert_eq!(result.matches("<!-- toc -->").count(), 2);
        assert_eq!(result.matches("<!-- tocstop -->").count(), 2);
        assert!(result.contains("- [Section](#section)"));
    }

    #[test]
    fn info_string_does_not_close_a_fence_before_the_toc_anchor() {
        // A closing fence may not carry an info string, so `# still inside code`
        // is code and must not become the insertion point.
        let content = "```\n# inside code\n```js\n# still inside code\n```\n\n# Real Title\n\n## Section\n\nBody.";
        let result = generate_document_toc(content);

        assert!(
            result.starts_with("```\n# inside code\n```js\n# still inside code\n```\n\n# Real Title\n\n<!-- toc -->"),
            "TOC must be inserted after the real H1: {result}"
        );
        assert!(
            !result.contains("- [inside code]"),
            "code headings must not be TOC entries: {result}"
        );
    }

    #[test]
    fn toc_markers_after_an_info_string_are_still_code() {
        let content = "```\ncode\n```js\n<!-- toc -->\nstale\n<!-- tocstop -->\n```\n\n# Title\n\n## Section";
        let result = generate_document_toc(content);

        assert!(
            result.contains("```js\n<!-- toc -->\nstale\n<!-- tocstop -->\n```"),
            "code sample must be untouched: {result}"
        );
        assert!(
            result
                .starts_with("```\ncode\n```js\n<!-- toc -->\nstale\n<!-- tocstop -->\n```\n\n# Title\n\n<!-- toc -->"),
            "fresh TOC must be inserted after the H1: {result}"
        );
    }

    #[test]
    fn builds_toc_from_provided_headings_without_parsing() {
        let headings = vec![
            HeadingEntry {
                level: 1,
                text: "Title".to_string(),
                anchor_id: "title".to_string(),
            },
            HeadingEntry {
                level: 2,
                text: "Section One".to_string(),
                anchor_id: "section-one".to_string(),
            },
        ];

        let content = "# Title\n\nIntro.\n\n## Section One\n\nBody.";
        let result = generate_document_toc_with_headings(content, Some(headings));

        assert!(result.contains("- [Title](#title)"));
        assert!(result.contains("  - [Section One](#section-one)"));
    }

    #[test]
    fn empty_headings_return_content_unchanged() {
        let content = "# Title\n\nBody.";
        assert_eq!(generate_document_toc_with_headings(content, Some(vec![])), content);
        assert_eq!(
            generate_document_toc_with_headings(content, None),
            generate_document_toc(content)
        );
    }

    #[test]
    fn stale_toc_region_is_emptied_when_headings_are_gone() {
        let content = "Intro.\n\n<!-- toc -->\n\n- [Gone](#gone)\n\n<!-- tocstop -->\n\nOutro.";
        let result = generate_document_toc(content);

        assert!(!result.contains("Gone"), "stale entry must be removed: {result}");
        assert!(
            result.contains("<!-- toc -->\n\n<!-- tocstop -->"),
            "region must be left empty: {result}"
        );
        assert!(result.starts_with("Intro.\n\n<!-- toc -->"), "result was: {result}");
        assert!(result.ends_with("<!-- tocstop -->\n\nOutro."), "result was: {result}");
    }

    #[test]
    fn toc_markers_in_code_are_not_cleared_without_headings() {
        let content = "```\n<!-- toc -->\n<!-- tocstop -->\n```\n\nNo headings.";
        assert_eq!(generate_document_toc(content), content);
    }

    #[test]
    fn frontmatter_headings_are_excluded_from_toc() {
        let content = "---\n# Not a real heading\n---\n# Title\n\n## Section\n\nBody.";
        let result = generate_document_toc(content);

        let toc = result
            .split("<!-- tocstop -->")
            .next()
            .unwrap_or(&result)
            .split("<!-- toc -->")
            .last()
            .unwrap_or(&result);
        assert!(!toc.contains("Not a real heading"));
        assert!(toc.contains("- [Title](#title)"));
        assert!(toc.contains("- [Section](#section)"));
    }

    #[test]
    fn frontmatter_is_not_the_toc_anchor_with_cached_headings() {
        // The `# Author: Y` comment inside the frontmatter must not be chosen
        // as the anchor when headings come from the cached render.
        let content = "---\ntitle: X\n# Author: Y\n---\n# Title\n\n## Section\n\nBody.";
        let headings = Some(vec![
            HeadingEntry {
                level: 1,
                text: "Title".to_string(),
                anchor_id: "title".to_string(),
            },
            HeadingEntry {
                level: 2,
                text: "Section".to_string(),
                anchor_id: "section".to_string(),
            },
        ]);
        let result = generate_document_toc_with_headings(content, headings);

        assert!(result.starts_with("---\ntitle: X\n# Author: Y\n---\n"));
        let toc = result
            .split("<!-- tocstop -->")
            .next()
            .unwrap_or(&result)
            .split("<!-- toc -->")
            .last()
            .unwrap_or(&result);
        assert!(!toc.contains("Author"));
        assert!(toc.contains("- [Title](#title)"));
        assert!(toc.contains("- [Section](#section)"));
    }

    #[test]
    fn toc_marker_in_an_indented_code_block_is_not_a_marker() {
        let content = "# Title\n\n    <!-- toc -->\n\n## Section\n\nBody.";
        let result = generate_document_toc(content);

        assert!(
            result.contains("    <!-- toc -->"),
            "code sample must be left alone: {result}"
        );
        assert!(
            result.starts_with("# Title\n\n<!-- toc -->\n\n- [Title](#title)"),
            "TOC must be inserted after the H1: {result}"
        );
        assert_eq!(result.matches("<!-- toc -->").count(), 2);
    }

    #[test]
    fn toc_marker_in_an_inline_code_span_is_not_a_marker() {
        let content = "# Title\n\nUse `<!-- toc -->` here.\n\n## Section\n\nBody.";
        let result = generate_document_toc(content);

        assert!(
            result.contains("Use `<!-- toc -->` here."),
            "inline code must be left alone: {result}"
        );
        assert!(
            result.starts_with("# Title\n\n<!-- toc -->\n\n- [Title](#title)"),
            "TOC must be inserted after the H1: {result}"
        );
    }

    #[test]
    fn escapes_markdown_metacharacters_in_toc_labels() {
        let headings = vec![
            HeadingEntry {
                level: 1,
                text: "a]b".to_string(),
                anchor_id: "ab".to_string(),
            },
            HeadingEntry {
                level: 2,
                text: r"C:\temp\file[1]".to_string(),
                anchor_id: "ctempfile1".to_string(),
            },
        ];
        let result = generate_document_toc_with_headings("# a]b\n\nBody.", Some(headings));

        assert!(result.contains(r"- [a\]b](#ab)"), "result was: {result}");
        assert!(
            result.contains(r"  - [C:\\temp\\file\[1\]](#ctempfile1)"),
            "result was: {result}"
        );
    }

    #[test]
    fn toc_marker_after_an_inline_code_span_is_still_a_marker() {
        let content = "# Title\n\n`code` <!-- toc -->\n\n- [Stale](#stale)\n\n<!-- tocstop -->\n\n## Section";
        let result = generate_document_toc(content);

        assert!(!result.contains("Stale"), "stale region must be replaced: {result}");
        assert!(result.contains("- [Section](#section)"), "result was: {result}");
    }
}
