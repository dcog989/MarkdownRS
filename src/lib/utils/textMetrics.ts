export interface TextMetrics {
    lineCount: number;
    wordCount: number;
    charCount: number;
}

export interface CursorMetrics extends TextMetrics {
    cursorLine: number;
    cursorCol: number;
    currentLineLength: number;
    currentWordIndex: number;
}

/**
 * Calculate basic text metrics locally in TypeScript to avoid IPC overhead
 */
export function calculateTextMetrics(content: string): TextMetrics {
    const lines = content.split('\n');

    // Fast word count implementation
    const trimmed = content.trim();
    const wordCount = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

    return {
        lineCount: lines.length,
        wordCount: wordCount,
        charCount: content.length,
    };
}

/**
 * Calculate metrics including cursor position locally
 */
export function calculateCursorMetrics(
    content: string,
    cursorOffset: number
): CursorMetrics {
    const metrics = calculateTextMetrics(content);
    const textUpToCursor = content.slice(0, cursorOffset);
    const linesUpToCursor = textUpToCursor.split('\n');

    const cursorLine = linesUpToCursor.length;
    const cursorCol = linesUpToCursor[cursorLine - 1].length + 1;

    const allLines = content.split('\n');
    const currentLineLength = allLines[cursorLine - 1]?.length || 0;

    const trimmedBefore = textUpToCursor.trim();
    const currentWordIndex = trimmedBefore === '' ? 0 : trimmedBefore.split(/\s+/).length;

    return {
        ...metrics,
        cursorLine,
        cursorCol,
        currentLineLength,
        currentWordIndex,
    };
}
