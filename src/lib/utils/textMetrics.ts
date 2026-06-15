import { CONFIG } from './config';

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
  const textUpToCursor = content.substring(0, cursorOffset);
  const currentWordIndex =
    content.length < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES
      ? countWords(textUpToCursor)
      : fastCountWords(textUpToCursor);

  return {
    cursorOffset,
    cursorLine: line.number,
    cursorCol: cursorOffset - line.from + 1,
    currentLineLength: line.text.length,
    currentWordIndex,
  };
}

export function computeLineStats(content: string): { lineCount: number; widestColumn: number } {
  const lines = content.split('\n');
  const lineCount = lines.length;
  const widestColumn = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return { lineCount, widestColumn };
}

export function detectLineEnding(content: string): 'LF' | 'CRLF' {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfOnlyCount = (content.match(/(?<!\r)\n/g) || []).length;
  return crlfCount > 0 && (crlfCount >= lfOnlyCount || lfOnlyCount === 0) ? 'CRLF' : 'LF';
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}
