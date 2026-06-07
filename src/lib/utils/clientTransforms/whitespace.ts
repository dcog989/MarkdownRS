import { INDENT_RE, linesFilter, linesMap } from './helpers';

const WHITESPACE_RE = /\s+/g;
const SENTENCE_SPLIT_RE = /([.!?])\s+(?=[A-Z])/g;

export function removeBlankLines(text: string): string {
  return linesFilter(text, (l) => l.trim().length > 0);
}

export function removeTrailingSpaces(text: string): string {
  return linesMap(text, (l) => l.trimEnd());
}

export function removeLeadingSpaces(text: string): string {
  return linesMap(text, (l) => l.trimStart());
}

export function removeAllSpaces(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ''))
    .filter(Boolean)
    .join('\n');
}

export function trimWhitespace(text: string): string {
  return linesMap(text, (l) => l.trim());
}

export function normalizeWhitespace(text: string): string {
  return linesMap(text, (l) => l.replace(WHITESPACE_RE, ' '));
}

export function joinLines(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
}

export function splitSentences(text: string): string {
  return text.replace(SENTENCE_SPLIT_RE, '$1\n');
}

export function wrapQuotes(text: string): string {
  return linesMap(text, (l) => (l.trim() ? `"${l.trim()}"` : l));
}

export function addLineNumbers(text: string): string {
  const lines = text.split('\n');
  const pad = String(lines.length).length;
  return lines.map((l, i) => (l.trim() ? `${String(i + 1).padStart(pad)}. ${l.trim()}` : l)).join('\n');
}

export function indentLines(text: string, width: number): string {
  const indent = ' '.repeat(width);
  return linesMap(text, (l) => (l.trim() ? `${l.match(INDENT_RE)?.[0] || ''}${indent}${l.trim()}` : l));
}

export function unindentLines(text: string, width: number): string {
  const regex = new RegExp(`^ {1,${width}}`);
  return linesMap(text, (l) => l.replace(regex, ''));
}
