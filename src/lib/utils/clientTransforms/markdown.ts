import { INDENT_RE, linesMap } from './helpers';

const BULLET_RE = /^[-*+]\s/;
const NUMBER_RE = /^\d+\.\s/;
const BULLET_REPLACE_RE = /^(\s*)(-|\*|\+|[0-9]+\.|- \[[ x]\])\s+/;
const BLOCKQUOTE_RE = /^>\s?/;

export function addBullets(text: string): string {
  return linesMap(text, (l) => {
    const trimmed = l.trim();
    if (!trimmed || BULLET_RE.test(trimmed) || NUMBER_RE.test(trimmed)) return l;
    const leadingSpace = l.match(INDENT_RE)?.[0] || '';
    return `${leadingSpace}- ${trimmed}`;
  });
}

export function addNumbers(text: string): string {
  let num = 1;
  return text
    .split('\n')
    .map((l) => (l.trim() ? `${num++}. ${l.trim()}` : l))
    .join('\n');
}

export function addCheckboxes(text: string): string {
  return linesMap(text, (l) => (l.trim() ? `- [ ] ${l.trim()}` : l));
}

export function removeListMarkers(text: string): string {
  return linesMap(text, (l) => l.replace(BULLET_REPLACE_RE, '$1'));
}

export function addBlockquote(text: string): string {
  return linesMap(text, (l) => (l.trim() ? `> ${l}` : l));
}

export function removeBlockquote(text: string): string {
  return linesMap(text, (l) => l.replace(BLOCKQUOTE_RE, ''));
}

export function addCodeFence(text: string): string {
  return `\`\`\`\n${text}\n\`\`\``;
}

export function increaseHeading(text: string): string {
  return linesMap(text, (l) => (l.startsWith('#') ? `#${l}` : `# ${l}`));
}

export function decreaseHeading(text: string): string {
  return linesMap(text, (l) => (l.startsWith('##') ? l.slice(1) : l.startsWith('# ') ? l.slice(2) : l));
}
