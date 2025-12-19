use markdown::to_html_with_options;
use markdown::{CompileOptions, Constructs, Options, ParseOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct MarkdownOptions {
    pub gfm: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenderResult {
    pub html: String,
    pub line_map: HashMap<usize, usize>,
}

/// Renders markdown to HTML with line number tracking
pub fn render_markdown(content: &str, options: MarkdownOptions) -> Result<RenderResult, String> {
    // Configure markdown options based on GFM setting
    let parse_options = if options.gfm {
        ParseOptions {
            constructs: Constructs::gfm(),
            ..ParseOptions::default()
        }
    } else {
        ParseOptions::default()
    };

    let compile_options = CompileOptions {
        allow_dangerous_html: false,
        allow_dangerous_protocol: false,
        ..CompileOptions::default()
    };

    let md_options = Options {
        parse: parse_options,
        compile: compile_options,
    };

    // Render markdown to HTML
    let html = to_html_with_options(content, &md_options).map_err(|e| e.to_string())?;

    // Inject data-source-line attributes
    let html_with_lines = inject_line_numbers(&html, content);

    // Build line map for scroll synchronization
    let line_map = build_line_map(content);

    Ok(RenderResult {
        html: html_with_lines,
        line_map,
    })
}

/// Injects data-source-line attributes into HTML elements by parsing line-by-line
fn inject_line_numbers(html: &str, _source: &str) -> String {
    let mut result = String::with_capacity(html.len() * 2);
    let mut line_number = 1;
    
    for line in html.lines() {
        let trimmed = line.trim_start();
        
        // Check if line starts with an opening tag we want to annotate
        if let Some(tag_end_pos) = trimmed.find('>') {
            let tag_part = &trimmed[..tag_end_pos];
            
            // Skip closing tags, self-closing tags, and void elements
            if !tag_part.starts_with("</") && !tag_part.ends_with('/') {
                let tag_name = tag_part
                    .trim_start_matches('<')
                    .split_whitespace()
                    .next()
                    .unwrap_or("");
                
                // Only add line numbers to block-level elements
                if is_block_element(tag_name) {
                    // Find where to insert the attribute (before the >)
                    let before_close = &trimmed[..tag_end_pos];
                    let after_close = &trimmed[tag_end_pos..];
                    
                    // Insert data-source-line attribute
                    let modified_line = format!(
                        "{}{} data-source-line=\"{}\"{}",
                        &line[..line.len() - trimmed.len()], // preserve indentation
                        before_close,
                        line_number,
                        after_close
                    );
                    result.push_str(&modified_line);
                } else {
                    result.push_str(line);
                }
            } else {
                result.push_str(line);
            }
        } else {
            result.push_str(line);
        }
        
        result.push('\n');
        
        // Increment line number for block elements
        if should_increment_line(line) {
            line_number += 1;
        }
    }
    
    result
}

/// Checks if a tag name represents a block-level element
fn is_block_element(tag_name: &str) -> bool {
    matches!(
        tag_name,
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "pre" | "blockquote" 
        | "ul" | "ol" | "li" | "table" | "tr" | "div" | "section" | "article"
    )
}

/// Determines if we should increment the line counter based on the HTML line
fn should_increment_line(line: &str) -> bool {
    let trimmed = line.trim();
    
    // Skip empty lines and closing tags
    if trimmed.is_empty() || trimmed.starts_with("</") {
        return false;
    }
    
    // Increment for block-level opening tags
    for tag in &["<h1", "<h2", "<h3", "<h4", "<h5", "<h6", "<p", "<li", "<pre", "<blockquote", "<table"] {
        if trimmed.starts_with(tag) {
            return true;
        }
    }
    
    false
}

/// Builds a map of source line numbers to HTML positions
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
        let options = MarkdownOptions { gfm: true };
        let result = render_markdown(content, options);
        assert!(result.is_ok());
        let rendered = result.unwrap();
        assert!(rendered.html.contains("<h1"));
        assert!(rendered.html.contains("Hello World"));
    }

    #[test]
    fn test_gfm_tables() {
        let content = "| Header |\n| ------ |\n| Cell   |";
        let options = MarkdownOptions { gfm: true };
        let result = render_markdown(content, options);
        assert!(result.is_ok());
        assert!(result.unwrap().html.contains("<table"));
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
        assert!(!is_block_element("span"));
        assert!(!is_block_element("a"));
    }
}
