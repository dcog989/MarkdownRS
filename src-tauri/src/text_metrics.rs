use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TextMetrics {
    pub line_count: usize,
    pub word_count: usize,
    pub char_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CursorMetrics {
    pub line_count: usize,
    pub word_count: usize,
    pub char_count: usize,
    pub cursor_line: usize,
    pub cursor_col: usize,
    pub current_line_length: usize,
    pub current_word_index: usize,
}

/// Calculate basic text metrics (lines, words, characters)
pub fn calculate_text_metrics(content: &str) -> TextMetrics {
    let line_count = if content.is_empty() {
        1
    } else {
        content.lines().count().max(1)
    };
    
    let word_count = count_words(content);
    let char_count = content.len();

    TextMetrics {
        line_count,
        word_count,
        char_count,
    }
}

/// Calculate metrics including cursor position
pub fn calculate_cursor_metrics(
    content: &str,
    cursor_offset: usize,
) -> Result<CursorMetrics, String> {
    let metrics = calculate_text_metrics(content);
    
    // Find cursor line and column
    let mut current_offset = 0;
    let mut cursor_line = 1;
    let mut cursor_col = 1;
    let mut current_line_length = 0;
    
    for (line_num, line) in content.lines().enumerate() {
        let line_end = current_offset + line.len();
        
        if cursor_offset <= line_end {
            cursor_line = line_num + 1;
            cursor_col = cursor_offset - current_offset + 1;
            current_line_length = line.len();
            break;
        }
        
        current_offset = line_end + 1; // +1 for newline
    }
    
    // Handle case where cursor is at the very end
    if cursor_offset >= content.len() {
        cursor_line = metrics.line_count;
        if let Some(last_line) = content.lines().last() {
            current_line_length = last_line.len();
            cursor_col = last_line.len() + 1;
        }
    }
    
    // Count words up to cursor
    let text_up_to_cursor = if cursor_offset > content.len() {
        content
    } else {
        &content[..cursor_offset]
    };
    let current_word_index = count_words(text_up_to_cursor);
    
    Ok(CursorMetrics {
        line_count: metrics.line_count,
        word_count: metrics.word_count,
        char_count: metrics.char_count,
        cursor_line,
        cursor_col,
        current_line_length,
        current_word_index,
    })
}

/// Count words in text using Unicode word boundaries
fn count_words(text: &str) -> usize {
    if text.trim().is_empty() {
        return 0;
    }
    
    let mut count = 0;
    let mut in_word = false;
    let mut prev_was_whitespace = true;
    
    for ch in text.chars() {
        let is_whitespace = ch.is_whitespace();
        let is_word_char = ch.is_alphanumeric() || ch == '\'' || ch == '-';
        
        if is_word_char {
            if !in_word && prev_was_whitespace {
                count += 1;
                in_word = true;
            }
        } else {
            in_word = false;
        }
        
        prev_was_whitespace = is_whitespace;
    }
    
    count
}

/// Calculate metrics for initial file load
pub fn calculate_file_metrics(content: &str) -> TextMetrics {
    calculate_text_metrics(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_metrics() {
        let content = "Hello world\nThis is a test\n";
        let metrics = calculate_text_metrics(content);
        
        assert_eq!(metrics.line_count, 2);
        assert_eq!(metrics.word_count, 6);
        assert_eq!(metrics.char_count, content.len());
    }

    #[test]
    fn test_empty_content() {
        let content = "";
        let metrics = calculate_text_metrics(content);
        
        assert_eq!(metrics.line_count, 1);
        assert_eq!(metrics.word_count, 0);
        assert_eq!(metrics.char_count, 0);
    }

    #[test]
    fn test_word_counting() {
        assert_eq!(count_words("hello world"), 2);
        assert_eq!(count_words("one two three"), 3);
        assert_eq!(count_words("it's working"), 2);
        assert_eq!(count_words("hyphen-word"), 1);
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("   "), 0);
    }

    #[test]
    fn test_cursor_metrics() {
        let content = "Line one\nLine two\nLine three";
        
        // Cursor at start of line 2
        let metrics = calculate_cursor_metrics(content, 9).unwrap();
        assert_eq!(metrics.cursor_line, 2);
        assert_eq!(metrics.cursor_col, 1);
        
        // Cursor at end
        let metrics = calculate_cursor_metrics(content, content.len()).unwrap();
        assert_eq!(metrics.cursor_line, 3);
    }

    #[test]
    fn test_single_line() {
        let content = "Just one line";
        let metrics = calculate_text_metrics(content);
        
        assert_eq!(metrics.line_count, 1);
        assert_eq!(metrics.word_count, 3);
    }

    #[test]
    fn test_large_file() {
        let content = "word ".repeat(10000);
        let metrics = calculate_text_metrics(&content);
        
        assert_eq!(metrics.word_count, 10000);
    }
}
