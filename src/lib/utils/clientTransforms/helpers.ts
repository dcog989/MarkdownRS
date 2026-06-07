const NUMBER_EXTRACT_RE = /-?\d+(\.\d+)?/;
export const INDENT_RE = /^\s*/;

export function extractNumber(str: string): number {
  const match = str.match(NUMBER_EXTRACT_RE);
  return match ? parseFloat(match[0]) : 0;
}

export function linesMap(text: string, fn: (line: string) => string): string {
  return text.split('\n').map(fn).join('\n');
}

export function linesFilter(text: string, fn: (line: string) => boolean): string {
  return text.split('\n').filter(fn).join('\n');
}
