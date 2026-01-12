import { CONFIG } from './config';

export interface TextMetrics {
    lineCount: number;
    wordCount: number;
    charCount: number;
}

export interface CursorMetrics {
    cursorOffset: number;
    cursorLine: number;
    cursorCol: number;
    currentLineLength: number;
    currentWordIndex: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

export function countWords(text: string): number {
    if (!text.trim()) return 0;
    let count = 0;
    for (const segment of segmenter.segment(text)) {
        if (segment.isWordLike) count++;
    }
    return count;
}

export function fastCountWords(text: string): number {
    let count = 0;
    let inWord = false;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const isAlpha =
            (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 39;

        if (isAlpha) {
            if (!inWord) {
                count++;
                inWord = true;
            }
        } else {
            inWord = false;
        }
    }
    return count;
}

export function calculateCursorMetrics(
    content: string,
    cursorOffset: number,
    line: { number: number; from: number; text: string },
): CursorMetrics {
    let currentWordIndex = 0;

    if (content.length < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES) {
        const textUpToCursor = content.substring(0, cursorOffset);
        currentWordIndex = countWords(textUpToCursor);
    } else {
        const textUpToCursor = content.substring(0, cursorOffset);
        currentWordIndex = fastCountWords(textUpToCursor);
    }

    return {
        cursorOffset,
        cursorLine: line.number,
        cursorCol: cursorOffset - line.from + 1,
        currentLineLength: line.text.length,
        currentWordIndex,
    };
}

export function formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num);
}
