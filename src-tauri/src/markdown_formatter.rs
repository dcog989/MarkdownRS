use crate::markdown_config::MarkdownFlavor;
use comrak::nodes::{AstNode, NodeValue};
use comrak::{format_commonmark, parse_document, Arena, Options};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormatterOptions {
    pub flavor: MarkdownFlavor,
    pub list_indent: usize,
    pub code_block_fence: String, // "```" or "~~~"
    pub bullet_char: String,      // "-", "*", or "+"
    pub table_alignment: bool,
    pub normalize_whitespace: bool,
    pub max_blank_lines: usize,
}

impl Default for FormatterOptions {
    fn default() -> Self {
        Self {
            flavor: MarkdownFlavor::default(),
            list_indent: 2,
            code_block_fence: "```".to_string(),
            bullet_char: "-".to_string(),
            table_alignment: true,
            normalize_whitespace: true,
            max_blank_lines: 2,
        }
    }
}

/// Format markdown content using comrak's AST-based approach
pub fn format_markdown(content: &str, options: &FormatterOptions) -> Result<String, String> {
    // Configure comrak options based on flavor
    let mut comrak_options = Options::default();
    comrak_options.extension = options.flavor.to_extension_options();
    
    // Parse markdown to AST
    let arena = Arena::new();
    let root = parse_document(&arena, content, &comrak_options);
    
    // Transform AST based on formatter options
    transform_ast(root, options);
    
    // Serialize AST back to markdown
    let mut formatted = String::new();
    format_commonmark(root, &comrak_options, &mut formatted)
        .map_err(|e| format!("Failed to format markdown: {}", e))?;
    
    let mut result = formatted;
    
    // Post-processing for style preferences
    result = post_process_formatting(&result, options);
    
    Ok(result)
}

/// Transforms the AST based on formatter options
fn transform_ast<'a>(node: &'a AstNode<'a>, options: &FormatterOptions) {
    // Recursively process all nodes
    for child in node.children() {
        match &mut child.data.borrow_mut().value {
            NodeValue::List(list) => {
                // Normalize list formatting
                match list.list_type {
                    comrak::nodes::ListType::Bullet => {
                        // Set bullet character preference
                        list.bullet_char = options.bullet_char.chars().next().unwrap_or('-') as u8;
                    }
                    comrak::nodes::ListType::Ordered => {
                        // Normalize ordered list start
                        list.start = 1;
                    }
                }
                list.tight = true; // Prefer tight lists
            }
            NodeValue::CodeBlock(code_block) => {
                // Normalize fence character
                code_block.fenced = true;
                code_block.fence_char = options.code_block_fence.chars().next().unwrap_or('`') as u8;
                code_block.fence_length = options.code_block_fence.len();
            }
            NodeValue::Heading(_) => {
                // Headings are already normalized by comrak
            }
            _ => {}
        }
        
        // Recursively transform children
        transform_ast(child, options);
    }
}

/// Post-processes the formatted markdown for additional style preferences
fn post_process_formatting(content: &str, options: &FormatterOptions) -> String {
    let mut result = content.to_string();
    
    // Normalize line endings
    result = result.replace("\r\n", "\n");
    
    if options.normalize_whitespace {
        // Remove trailing whitespace from lines
        result = result
            .lines()
            .map(|line| line.trim_end())
            .collect::<Vec<_>>()
            .join("\n");
    }
    
    // Limit consecutive blank lines
    if options.max_blank_lines > 0 {
        let pattern = "\n".repeat(options.max_blank_lines + 2);
        let replacement = "\n".repeat(options.max_blank_lines + 1);
        while result.contains(&pattern) {
            result = result.replace(&pattern, &replacement);
        }
    }
    
    // Ensure file ends with single newline
    result = result.trim_end().to_string() + "\n";
    
    result
}

/// Formats markdown tables for better alignment (if enabled)
/// This is applied during post-processing since comrak handles table structure
fn _format_table_alignment(content: &str) -> String {
    // Comrak already handles table alignment during rendering
    // This function is kept for potential future custom table formatting
    content.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_line_endings() {
        let input = "line1\r\nline2\r\nline3";
        let options = FormatterOptions::default();
        let result = format_markdown(input, &options).unwrap();
        assert!(!result.contains("\r\n"));
    }

    #[test]
    fn test_bullet_char_normalization() {
        let input = "* item1\n* item2\n+ item3";
        let options = FormatterOptions {
            bullet_char: "-".to_string(),
            ..Default::default()
        };
        let result = format_markdown(input, &options).unwrap();
        // All bullets should be normalized to the preferred character
        assert!(result.contains("- item1") || result.contains("-   item1"));
    }

    #[test]
    fn test_heading_formatting() {
        let input = "# Heading   \n##   Another Heading   ##\n";
        let options = FormatterOptions::default();
        let result = format_markdown(input, &options).unwrap();
        // Headings should be cleaned up (comrak handles this)
        assert!(result.contains("# Heading"));
        assert!(result.contains("## Another Heading"));
    }

    #[test]
    fn test_code_fence_normalization() {
        let input = "~~~js\ncode\n~~~";
        let options = FormatterOptions {
            code_block_fence: "```".to_string(),
            ..Default::default()
        };
        let result = format_markdown(input, &options).unwrap();
        assert!(result.contains("```"));
    }

    #[test]
    fn test_file_ends_with_newline() {
        let input = "content";
        let options = FormatterOptions::default();
        let result = format_markdown(input, &options).unwrap();
        assert!(result.ends_with('\n'));
    }

    #[test]
    fn test_max_blank_lines() {
        let input = "line1\n\n\n\n\nline2";
        let options = FormatterOptions {
            max_blank_lines: 2,
            ..Default::default()
        };
        let result = format_markdown(input, &options).unwrap();
        // Should have at most 2 blank lines (3 newlines total)
        assert!(!result.contains("\n\n\n\n"));
    }

    #[test]
    fn test_gfm_table_formatting() {
        let input = "| Header |\n|--------|\n| Cell   |";
        let options = FormatterOptions {
            flavor: MarkdownFlavor::GFM,
            table_alignment: true,
            ..Default::default()
        };
        let result = format_markdown(input, &options).unwrap();
        // Table should be preserved in GFM mode
        assert!(result.contains("|"));
    }

    #[test]
    fn test_ordered_list_normalization() {
        let input = "5. First item\n6. Second item\n7. Third item";
        let options = FormatterOptions::default();
        let result = format_markdown(input, &options).unwrap();
        // Ordered lists should start at 1
        assert!(result.contains("1."));
    }

    #[test]
    fn test_preserve_gfm_features() {
        let input = "~~strikethrough~~\n\n- [ ] Task\n- [x] Done";
        let options = FormatterOptions {
            flavor: MarkdownFlavor::GFM,
            ..Default::default()
        };
        let result = format_markdown(input, &options).unwrap();
        // GFM features should be preserved
        assert!(result.contains("~~"));
        assert!(result.contains("[ ]"));
        assert!(result.contains("[x]"));
    }

    #[test]
    fn test_commonmark_strict() {
        let input = "# Heading\n\nParagraph with text.";
        let options = FormatterOptions {
            flavor: MarkdownFlavor::CommonMark,
            ..Default::default()
        };
        let result = format_markdown(input, &options).unwrap();
        assert!(result.contains("# Heading"));
        assert!(result.contains("Paragraph"));
    }

    #[test]
    fn test_whitespace_normalization() {
        let input = "line with trailing spaces   \n\nanother line   ";
        let options = FormatterOptions {
            normalize_whitespace: true,
            ..Default::default()
        };
        let result = format_markdown(input, &options).unwrap();
        // Trailing spaces should be removed (except intentional line breaks)
        for line in result.lines() {
            if !line.is_empty() {
                assert!(!line.ends_with("   "));
            }
        }
    }

    #[test]
    fn test_roundtrip_preservation() {
        let input = "# Title\n\nParagraph with **bold** and *italic*.\n\n- Item 1\n- Item 2";
        let options = FormatterOptions::default();
        
        // Format once
        let formatted1 = format_markdown(input, &options).unwrap();
        
        // Format again (should be idempotent)
        let formatted2 = format_markdown(&formatted1, &options).unwrap();
        
        // Results should be identical
        assert_eq!(formatted1, formatted2);
    }
}
