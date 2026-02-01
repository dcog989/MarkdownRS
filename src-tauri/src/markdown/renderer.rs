use crate::markdown::config::MarkdownFlavor;
use comrak::{Arena, format_html_with_plugins, options::Plugins, parse_document};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;
use unicode_segmentation::UnicodeSegmentation;

// Lazy-compiled regex for file paths
// Matches:
// - Windows absolute paths: C:/ or C:\
// - Unix absolute paths: /path/to/file
// - Relative paths: ./ or ../
// - Home directory: ~/
static PATH_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?:^|\s)([A-Za-z]:[/\\][^\s<>"'|?*`]*|(?:\./|\.\./|~/)[^\s<>"'|?*`]+|/[^\s<>"'|?*`]+)"#,
    )
    .expect("Invalid PATH_REGEX pattern")
});

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct MarkdownOptions {
    pub flavor: MarkdownFlavor,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenderResult {
    pub html: String,
    pub line_map: HashMap<usize, usize>,
    pub line_count: usize,
    pub word_count: usize,
    pub char_count: usize,
    pub widest_column: usize,
}

/// Renders markdown to HTML with line number tracking and document metrics
pub fn render_markdown(content: &str, options: MarkdownOptions) -> Result<RenderResult, String> {
    let comrak_options = options.flavor.to_comrak_options();

    let arena = Arena::new();
    let root = parse_document(&arena, content, &comrak_options);

    let mut html = String::new();
    format_html_with_plugins(root, &comrak_options, &mut html, &Plugins::default())
        .map_err(|e| format!("Failed to render markdown: {}", e))?;

    let html_with_lines = inject_line_numbers(&html, content);
    let html_with_links = linkify_file_paths(&html_with_lines);
    let line_map = build_line_map(content);

    // Single-pass metrics calculation
    let (line_count, word_count, char_count, widest_column) = calculate_text_metrics(content);

    Ok(RenderResult {
        html: html_with_links,
        line_map,
        line_count,
        word_count,
        char_count,
        widest_column,
    })
}

fn linkify_file_paths(html: &str) -> String {
    const SKIP_TAGS: &[&str] = &["<a", "<code", "<pre", "</"];
    let mut result = String::with_capacity(html.len() * 2);

    for line in html.lines() {
        let should_skip = SKIP_TAGS
            .iter()
            .any(|tag| line.trim_start().starts_with(tag));

        // Also skip lines that contain <code> tags anywhere in them to avoid
        // linkifying paths inside inline code
        let contains_code = line.contains("<code>") || line.contains("</code>");

        if should_skip || contains_code {
            result.push_str(line);
            result.push('\n');
            continue;
        }

        let mut last_end = 0;
        for cap in PATH_REGEX.captures_iter(line) {
            let full_match = cap
                .get(0)
                .expect("Regex capture should always have group 0");
            let path = cap
                .get(1)
                .expect("Regex capture should always have group 1")
                .as_str();
            let start = full_match.start();
            let end = full_match.end();

            result.push_str(&line[last_end..start]);

            let leading_space = &full_match.as_str()[..full_match.as_str().len() - path.len()];
            result.push_str(leading_space);

            result.push_str(&format!(
                r#"<a href="{}" class="file-path-link" style="color: var(--color-accent-filepath); text-decoration: underline; cursor: pointer;">{}</a>"#,
                path, path
            ));

            last_end = end;
        }

        result.push_str(&line[last_end..]);
        result.push('\n');
    }

    result
}

fn inject_line_numbers(html: &str, source: &str) -> String {
    let mut result = String::with_capacity(html.len() * 2);
    let mut current_line = 1;
    let source_lines: Vec<&str> = source.lines().collect();

    for line in html.lines() {
        let trimmed = line.trim_start();

        if let Some(tag_end_pos) = trimmed.find('>') {
            let tag_part = &trimmed[..tag_end_pos];

            if !tag_part.starts_with("</")
                && !tag_part.ends_with('/')
                && !tag_part.starts_with("<!--")
            {
                let tag_name = tag_part
                    .trim_start_matches('<')
                    .split_whitespace()
                    .next()
                    .unwrap_or("");

                if is_block_element(tag_name) {
                    let source_line = find_source_line(&source_lines, current_line);
                    let indent = &line[..line.len() - trimmed.len()];
                    let before_close = &trimmed[..tag_end_pos];
                    let after_close = &trimmed[tag_end_pos..];

                    result.push_str(indent);
                    result.push_str(before_close);
                    result.push_str(&format!(" data-source-line=\"{}\"", source_line));
                    result.push_str(after_close);
                    result.push('\n');
                    continue;
                }
            }
        }

        result.push_str(line);
        result.push('\n');

        if should_increment_line(line) {
            current_line += 1;
        }
    }

    result
}

fn is_block_element(tag_name: &str) -> bool {
    matches!(
        tag_name,
        "h1" | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "p"
            | "pre"
            | "blockquote"
            | "ul"
            | "ol"
            | "li"
            | "table"
            | "thead"
            | "tbody"
            | "tr"
            | "th"
            | "td"
            | "div"
            | "section"
            | "article"
            | "header"
            | "footer"
            | "hr"
            | "dl"
            | "dt"
            | "dd"
    )
}

fn should_increment_line(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with("</") {
        return false;
    }
    for tag in &[
        "<h1",
        "<h2",
        "<h3",
        "<h4",
        "<h5",
        "<h6",
        "<p",
        "<li",
        "<pre",
        "<blockquote",
        "<table",
        "<tr",
        "<hr",
    ] {
        if trimmed.starts_with(tag) {
            return true;
        }
    }
    false
}

fn find_source_line(source_lines: &[&str], html_line: usize) -> usize {
    html_line.min(source_lines.len())
}

fn build_line_map(content: &str) -> HashMap<usize, usize> {
    let mut line_map = HashMap::new();
    let mut line_num = 1;
    let mut offset = 0;

    for line in content.lines() {
        line_map.insert(line_num, offset);
        offset += line.len() + 1;
        line_num += 1;
    }

    line_map
}

/// Calculates text metrics in a single pass
/// Returns: (line_count, word_count, char_count, widest_column)
pub fn calculate_text_metrics(content: &str) -> (usize, usize, usize, usize) {
    let lines: Vec<&str> = content.lines().collect();
    let line_count = lines.len();
    let word_count = content.unicode_words().count();
    let char_count = content.chars().count();
    let widest_column = lines.iter().map(|l| l.chars().count()).max().unwrap_or(0);
    (line_count, word_count, char_count, widest_column)
}
