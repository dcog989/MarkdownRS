import type { Text } from "@codemirror/state";

export interface CursorMetrics {
  cursorOffset: number;
  cursorLine: number;
  cursorCol: number;
  currentLineLength: number;
  currentWordIndex: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

// Intl.Segmenter is dictionary-aware (ideographs, abbreviations) but ~10x slower
// than a regex pass. Most documents are Latin/ASCII prose, so use a fast regex
// word-run counter there and fall back to Segmenter only when CJK ideographs are
// present, where segmentation needs the dictionary.
const CJK_RANGE_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
const WORD_RUN_RE = /[\p{L}\p{N}_']+/gu;

function countWordsRegex(text: string): number {
  WORD_RUN_RE.lastIndex = 0;
  let count = 0;
  while (WORD_RUN_RE.exec(text) !== null) count++;
  return count;
}

export function countWords(text: string): number {
  if (!text.trim()) return 0;
  if (CJK_RANGE_RE.test(text)) {
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) count++;
    }
    return count;
  }
  return countWordsRegex(text);
}

// The cursor word position only changes by the text between the old and the new
// cursor, so a cursor move can adjust the cached count instead of re-scanning
// the whole prefix. CodeMirror keeps the same Text object while only the
// selection moves.
// shortcut: CJK text still re-counts the whole prefix (Intl.Segmenter counts
// are not a sum of slices); revisit if large CJK documents feel slow.
const WORD_CHAR_RE = /[\p{L}\p{N}_']/u;
let wordIndexCache: { doc: Text; offset: number; count: number; hasCjk: boolean } | null = null;

function countWordsUpTo(doc: Text, offset: number): number {
  if (offset <= 0) return 0;

  const cached = wordIndexCache;
  if (cached && cached.doc === doc) {
    if (cached.offset === offset) return cached.count;

    const from = Math.min(cached.offset, offset);
    const to = Math.max(cached.offset, offset);
    const between = doc.sliceString(from, to);

    if (!cached.hasCjk && !CJK_RANGE_RE.test(between)) {
      const merged =
        from > 0 && WORD_CHAR_RE.test(doc.sliceString(from - 1, from)) && WORD_CHAR_RE.test(between[0] ?? "");
      const delta = countWords(between) - (merged ? 1 : 0);
      const count = cached.count + (offset > cached.offset ? delta : -delta);
      wordIndexCache = { doc, offset, count, hasCjk: false };
      return count;
    }
  }

  const prefix = doc.sliceString(0, offset);
  const count = countWords(prefix);
  wordIndexCache = { doc, offset, count, hasCjk: CJK_RANGE_RE.test(prefix) };
  return count;
}

export function calculateCursorMetrics(
  doc: Text,
  cursorOffset: number,
  line: { number: number; from: number; text: string },
): CursorMetrics {
  const currentWordIndex = countWordsUpTo(doc, cursorOffset);

  return {
    cursorOffset,
    cursorLine: line.number,
    cursorCol: cursorOffset - line.from + 1,
    currentLineLength: line.text.length,
    currentWordIndex,
  };
}

export function computeLineStats(content: string): { lineCount: number; widestColumn: number } {
  const lines = content.split("\n");
  const lineCount = lines.length;
  const widestColumn = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return { lineCount, widestColumn };
}

export function detectLineEnding(content: string): "LF" | "CRLF" {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfOnlyCount = (content.match(/(?<!\r)\n/g) || []).length;
  return crlfCount > 0 && (crlfCount >= lfOnlyCount || lfOnlyCount === 0) ? "CRLF" : "LF";
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}
