use crate::markdown_config::MarkdownFlavor;
use comrak::{
    format_html_with_plugins, parse_document, Arena, Options,
    options::Plugins,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    format_html_with_plugins(
        root,
        &comrak_options,
        &mut html,
        &Plugins::default(),
    )
    .map_err(|e| format!("Failed to render markdown: {}", e))?;
    
    // Inject line numbers for scroll synchronization
    let html_with_lines = inject_line_numbers(&html, content);
    
    // Build line map for scroll synchronization
    let line_map = build_line_map(content);
    
    Ok(RenderResult {
        html: html_with_lines,
        line_map,
    })
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
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" 
        | "p" | "pre" | "blockquote" 
        | "ul" | "ol" | "li" 
        | "table" | "thead" | "tbody" | "tr" | "th" | "td"
        | "div" | "section" | "article" | "header" | "footer"
        | "hr" | "dl" | "dt" | "dd"
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
        "<h1", "<h2", "<h3", "<h4", "<h5", "<h6",
        "<p", "<li", "<pre", "<blockquote",
        "<table", "<tr", "<hr",
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
}
