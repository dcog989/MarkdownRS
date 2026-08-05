use unicode_segmentation::UnicodeSegmentation;

/// Builds document metrics (line, word, char counts and the widest line length
/// in characters). The per-line byte-offset map that previously accompanied these
/// is intentionally not computed here: it is deterministic from the source content
/// and the frontend already derives its own map from the rendered DOM, so shipping
/// it over IPC would be dead payload on every render.
pub(super) fn build_metrics(content: &str) -> (usize, usize, usize, usize) {
    if content.is_empty() {
        return (1, 0, 0, 0);
    }

    let mut line_count = 1;
    let mut char_count = 0;
    let mut widest_column = 0;
    let mut current_column = 0;

    for c in content.chars() {
        char_count += 1;
        if c == '\n' {
            line_count += 1;
            if current_column > widest_column {
                widest_column = current_column;
            }
            current_column = 0;
        } else {
            current_column += 1;
        }
    }

    if current_column > widest_column {
        widest_column = current_column;
    }

    let word_count = content.unicode_words().count();

    (line_count, word_count, char_count, widest_column)
}
