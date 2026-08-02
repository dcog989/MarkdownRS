use unicode_segmentation::UnicodeSegmentation;

/// Builds a per-line byte-offset map plus document metrics
/// (line, word, char counts and the widest line length in characters).
pub(super) fn build_line_map_and_metrics(
    content: &str,
) -> (Vec<usize>, usize, usize, usize, usize) {
    if content.is_empty() {
        return (vec![0], 0, 0, 0, 0);
    }

    let mut line_map = Vec::new();
    let mut offset = 0;
    let mut char_count = 0;
    let mut widest_column = 0;
    let mut current_column = 0;

    line_map.push(0);
    for c in content.chars() {
        char_count += 1;
        if c == '\n' {
            line_map.push(offset + 1);
            if current_column > widest_column {
                widest_column = current_column;
            }
            current_column = 0;
        } else {
            current_column += 1;
        }
        offset += c.len_utf8();
    }

    if current_column > widest_column {
        widest_column = current_column;
    }

    let line_count = line_map.len();
    let word_count = content.unicode_words().count();

    (line_map, line_count, word_count, char_count, widest_column)
}
