import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  byteLength,
  calculateCursorMetrics,
  computeLineStats,
  countWords,
  detectLineEnding,
  formatNumber,
} from './textMetrics';

describe('countWords', () => {
  it('counts space-separated words', () => {
    expect(countWords('hello world')).toBe(2);
  });

  it('counts zero for empty or whitespace-only text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t')).toBe(0);
  });

  it('ignores punctuation-only tokens', () => {
    expect(countWords('hello, world!')).toBe(2);
  });
});

describe('calculateCursorMetrics', () => {
  it('computes line, column, and word index from the cursor offset', () => {
    const doc = Text.of(['alpha beta', 'gamma']);
    const line = doc.line(2);
    const metrics = calculateCursorMetrics(doc, doc.line(2).from + 2, line);

    expect(metrics.cursorLine).toBe(2);
    expect(metrics.cursorCol).toBe(3);
    expect(metrics.currentLineLength).toBe(5);
    expect(metrics.currentWordIndex).toBe(3);
    expect(metrics.cursorOffset).toBe(doc.line(2).from + 2);
  });
});

describe('computeLineStats', () => {
  it('counts lines and the widest column', () => {
    expect(computeLineStats('ab\ncdef\n')).toEqual({ lineCount: 3, widestColumn: 4 });
  });

  it('handles a single line with no trailing newline', () => {
    expect(computeLineStats('hello')).toEqual({ lineCount: 1, widestColumn: 5 });
  });
});

describe('detectLineEnding', () => {
  it('detects CRLF when it dominates', () => {
    expect(detectLineEnding('a\r\nb\r\nc')).toBe('CRLF');
  });

  it('detects LF for lone line feeds', () => {
    expect(detectLineEnding('a\nb\nc')).toBe('LF');
  });

  it('detects LF for a single text with no newlines', () => {
    expect(detectLineEnding('plain')).toBe('LF');
  });
});

describe('byteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(byteLength('hello')).toBe(5);
    expect(byteLength('héllo')).toBe(6);
    expect(byteLength('🎉')).toBe(4);
  });
});

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});
