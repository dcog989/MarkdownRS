use crate::markdown_config::MarkdownFlavor;
use comrak::{Arena, Options, format_html_with_plugins, options::Plugins, parse_document};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Debug, Serialize, Deserialize)]
pub struct MarkdownOptions {
    pub flavor: MarkdownFlavor,
}

impl Default for MarkdownOptions {
    fn default() -> Self {
        Self {
            flavor: MarkdownFlavor::default(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenderResult {
    pub html: String,
    pub line_map: HashMap<usize, usize>,
}

/// Renders markdown to HTML with line number tracking using comrak
pub fn render_markdown(content: &str, options: MarkdownOptions) -> Result<RenderResult, String> {
    // Configure comrak options based on flavor
    let mut comrak_options = Options::default();
    comrak_options.extension = options.flavor.to_extension_options();

    // Render options
    comrak_options.render.r#unsafe = false; // Security: disable raw HTML
    comrak_options.render.escape = false; // Don't escape entities (comrak handles this)

    // Parse options
    comrak_options.parse.smart = true; // Smart punctuation
    comrak_options.parse.default_info_string = None;

    // Parse markdown to AST
    let arena = Arena::new();
    let root = parse_document(&arena, content, &comrak_options);

    // Render HTML
    let mut html = String::new();
    format_html_with_plugins(root, &comrak_options, &mut html, &Plugins::default())
        .map_err(|e| format!("Failed to render markdown: {}", e))?;

    // Inject line numbers for scroll synchronization
    let html_with_lines = inject_line_numbers(&html, content);

    // Linkify file paths
    let html_with_links = linkify_file_paths(&html_with_lines);

    // Build line map for scroll synchronization
    let line_map = build_line_map(content);

    Ok(RenderResult {
        html: html_with_links,
        line_map,
    })
}

/// Linkifies file paths in HTML content
/// Matches Windows paths (C:\...), Unix absolute paths (/...), and relative paths (./... or ../...)
fn linkify_file_paths(html: &str) -> String {
    // Lazy-compiled regex for file paths
    // Use r#""# to allow double quotes inside the regex pattern for the character class negation
    static PATH_REGEX: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(?:^|\s)([A-Za-z]:[/\\][^\s<>\"'|?*]*|(?:\.\.?/|~/)[^\s<>\"'|?*]+)"#).unwrap()
    });

    // Tags where we should NOT linkify paths
    const SKIP_TAGS: &[&str] = &["<a", "<code", "<pre", "</"];

    let mut result = String::with_capacity(html.len() * 2);

    // Process line by line to avoid linkifying inside code blocks or existing links
    for line in html.lines() {
        // Check if this line is inside a tag we should skip
        let should_skip = SKIP_TAGS
            .iter()
            .any(|tag| line.trim_start().starts_with(tag));

        if should_skip {
            result.push_str(line);
            result.push('\n');
            continue;
        }

        // Find all path matches in this line
        let mut last_end = 0;
        for cap in PATH_REGEX.captures_iter(line) {
            let full_match = cap.get(0).unwrap();
            let path = cap.get(1).unwrap().as_str();
            let start = full_match.start();
            let end = full_match.end();

            // Add text before match
            result.push_str(&line[last_end..start]);

            // Add any leading whitespace
            let leading_space = &full_match.as_str()[..full_match.as_str().len() - path.len()];
            result.push_str(leading_space);

            // Create link
            result.push_str(&format!(
                r#"<a href="{}" class="file-path-link" style="color: var(--color-accent-filepath); text-decoration: underline; cursor: pointer;">{}</a>"#,
                path, path
            ));

            last_end = end;
        }

        // Add remaining text
        result.push_str(&line[last_end..]);
        result.push('\n');
    }

    result
}

/// Injects data-source-line attributes into HTML elements for scroll sync
fn inject_line_numbers(html: &str, source: &str) -> String {
    let mut result = String::with_capacity(html.len() * 2);
    let mut current_line = 1;
    let source_lines: Vec<&str> = source.lines().collect();

    for line in html.lines() {
        let trimmed = line.trim_start();

        // Detect opening tags for block-level elements
        if let Some(tag_end_pos) = trimmed.find('>') {
            let tag_part = &trimmed[..tag_end_pos];

            // Skip closing tags, self-closing tags, and comments
            if !tag_part.starts_with("</")
                && !tag_part.ends_with('/')
                && !tag_part.starts_with("<!--")
            {
                let tag_name = tag_part
                    .trim_start_matches('<')
                    .split_whitespace()
                    .next()
                    .unwrap_or("");

                // Only annotate block-level elements
                if is_block_element(tag_name) {
                    // Find the source line that corresponds to this HTML element
                    let source_line = find_source_line(&source_lines, current_line);

                    // Inject data-source-line attribute
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

        // Track line progression
        if should_increment_line(line) {
            current_line += 1;
        }
    }

    result
}

/// Checks if a tag name represents a block-level element
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

/// Determines if we should increment the line counter
fn should_increment_line(line: &str) -> bool {
    let trimmed = line.trim();

    if trimmed.is_empty() || trimmed.starts_with("</") {
        return false;
    }

    // Increment for block-level opening tags
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

/// Finds the corresponding source line for an HTML line
fn find_source_line(source_lines: &[&str], html_line: usize) -> usize {
    // Simple heuristic: map HTML lines to source lines
    // This is approximate but works well for most cases
    html_line.min(source_lines.len())
}

/// Builds a map of source line numbers to byte offsets
fn build_line_map(content: &str) -> HashMap<usize, usize> {
    let mut line_map = HashMap::new();
    let mut line_num = 1;
    let mut offset = 0;

    for line in content.lines() {
        line_map.insert(line_num, offset);
        offset += line.len() + 1; // +1 for newline
        line_num += 1;
    }

    line_map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_rendering() {
        let content = "# Hello World\n\nThis is a test.";
        let options = MarkdownOptions::default();
        let result = render_markdown(content, options);

        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.html.contains("<h1"));
        assert!(rendered.html.contains("Hello World"));
        assert!(rendered.html.contains("<p>"));
        assert!(rendered.html.contains("This is a test."));
    }

    #[test]
    fn test_gfm_tables() {
        let content = "| Header |\n|--------|\n| Cell   |";
        let options = MarkdownOptions {
            flavor: MarkdownFlavor::GFM,
        };
        let result = render_markdown(content, options);

        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.html.contains("<table"));
        assert!(rendered.html.contains("<th"));
        assert!(rendered.html.contains("<td"));
    }

    #[test]
    fn test_gfm_strikethrough() {
        let content = "~~strikethrough~~";
        let options = MarkdownOptions {
            flavor: MarkdownFlavor::GFM,
        };
        let result = render_markdown(content, options);

        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.html.contains("<del>") || rendered.html.contains("<s>"));
    }

    #[test]
    fn test_gfm_task_lists() {
        let content = "- [ ] Unchecked\n- [x] Checked";
        let options = MarkdownOptions {
            flavor: MarkdownFlavor::GFM,
        };
        let result = render_markdown(content, options);

        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.html.contains("checkbox"));
    }

    #[test]
    fn test_commonmark_no_tables() {
        let content = "| Header |\n|--------|\n| Cell   |";
        let options = MarkdownOptions {
            flavor: MarkdownFlavor::CommonMark,
        };
        let result = render_markdown(content, options);

        assert!(result.is_ok());
        let rendered = result.unwrap();
        // Should not render as table in pure CommonMark
        assert!(!rendered.html.contains("<table"));
    }

    #[test]
    fn test_line_map_generation() {
        let content = "Line 1\nLine 2\nLine 3";
        let line_map = build_line_map(content);

        assert_eq!(line_map.get(&1), Some(&0));
        assert_eq!(line_map.get(&2), Some(&7));
        assert_eq!(line_map.get(&3), Some(&14));
    }

    #[test]
    fn test_line_number_injection() {
        let html = "<h1>Test</h1>\n<p>Paragraph</p>";
        let source = "# Test\n\nParagraph";
        let result = inject_line_numbers(html, source);

        assert!(result.contains("data-source-line"));
    }

    #[test]
    fn test_is_block_element() {
        assert!(is_block_element("h1"));
        assert!(is_block_element("p"));
        assert!(is_block_element("div"));
        assert!(is_block_element("table"));
        assert!(!is_block_element("span"));
        assert!(!is_block_element("a"));
        assert!(!is_block_element("strong"));
    }

    #[test]
    fn test_unsafe_html_disabled() {
        let content = "<script>alert('xss')</script>\n\n# Title";
        let options = MarkdownOptions::default();
        let result = render_markdown(content, options);

        assert!(result.is_ok());
        let rendered = result.unwrap();
        // Should not contain script tag
        assert!(!rendered.html.contains("<script>"));
    }

    #[test]
    fn test_linkify_windows_path() {
        let content = "Check out C:\\Users\\test\\document.md for details.";
        let options = MarkdownOptions::default();
        let result = render_markdown(content, options);

        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.html.contains("<a href=\""));
        assert!(rendered.html.contains("C:\\Users\\test\\document.md"));
        assert!(rendered.html.contains("file-path-link"));
    }

    #[test]
    fn test_linkify_unix_path() {
        let content = "See ./docs/readme.md and ~/project/file.txt";
        let options = MarkdownOptions::default();
        let result = render_markdown(content, options);

        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.html.contains("./docs/readme.md"));
        assert!(rendered.html.contains("~/project/file.txt"));
    }

    #[test]
    fn test_no_linkify_in_code() {
        let content = "`C:\\path\\to\\file.txt` should not be linked";
        let options = MarkdownOptions::default();
        let result = render_markdown(content, options);

        assert!(result.is_ok());
        let rendered = result.unwrap();
        // Path appears in code tag, should not have an <a> tag around it
        let code_section = rendered.html.split("<code>").nth(1).unwrap();
        assert!(!code_section.contains("<a href="));
    }
}
