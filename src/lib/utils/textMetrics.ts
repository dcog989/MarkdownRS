import type { Text } from '@codemirror/state';

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

export function calculateCursorMetrics(
  doc: Text,
  cursorOffset: number,
  line: { number: number; from: number; text: string },
): CursorMetrics {
  const currentWordIndex = countWords(doc.sliceString(0, cursorOffset));

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
