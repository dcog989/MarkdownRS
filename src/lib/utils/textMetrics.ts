export interface TextMetrics {
    lineCount: number;
    wordCount: number;
    charCount: number;
}

export interface CursorMetrics extends TextMetrics {
    cursorOffset: number;
    cursorLine: number;
    cursorCol: number;
    currentLineLength: number;
    currentWordIndex: number;
}

/**
 * Robust word counter using Intl.Segmenter for Unicode awareness
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

export function countWords(text: string): number {
    if (!text.trim()) return 0;
    let count = 0;
    for (const segment of segmenter.segment(text)) {
        if (segment.isWordLike) count++;
    }
    return count;
}

/**
 * Calculate basic text metrics locally
 */
export function calculateTextMetrics(content: string): TextMetrics {
    return {
        lineCount: content.split('\n').length,
        wordCount: countWords(content),
        charCount: content.length,
    };
}

/**
 * Calculate full cursor and document metrics locally
 * @param content Full document text
 * @param cursorOffset Byte/char offset from CodeMirror
 * @param line Information for the current line provided by CodeMirror
 */
export function calculateCursorMetrics(
    content: string,
    cursorOffset: number,
    line: { number: number; from: number; text: string }
): CursorMetrics {
    const textUpToCursor = content.substring(0, cursorOffset);

    return {
        lineCount: content.split('\n').length,
        wordCount: countWords(content),
        charCount: content.length,
        cursorOffset: cursorOffset,
        cursorLine: line.number,
        cursorCol: cursorOffset - line.from + 1,
        currentLineLength: Math.max(line.text.length, cursorOffset - line.from),
        currentWordIndex: countWords(textUpToCursor),
    };
}
