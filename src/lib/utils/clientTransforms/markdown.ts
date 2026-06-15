import { INDENT_RE, linesMap } from './helpers';

const BULLET_RE = /^[-*+]\s/;
const NUMBER_RE = /^\d+\.\s/;
const CHECKBOX_RE = /^- \[[ x]\]\s/;
const LIST_MARKER_RE = /^(\s*)(-|\*|\+|[0-9]+\.|- \[[ x]\])\s+/;
const BLOCKQUOTE_RE = /^>\s?/;
const CODE_FENCE_RE = /^```/;

export function toggleBullets(text: string): string {
  const lines = text.split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  const allHaveBullets = nonEmpty.length > 0 && nonEmpty.every((l) => BULLET_RE.test(l.trim()));
  if (allHaveBullets) {
    return lines.map((l) => l.replace(LIST_MARKER_RE, '$1')).join('\n');
  }
  return lines
    .map((l) => {
      const trimmed = l.trim();
      if (!trimmed || BULLET_RE.test(trimmed) || NUMBER_RE.test(trimmed) || CHECKBOX_RE.test(trimmed)) return l;
      const leadingSpace = l.match(INDENT_RE)?.[0] || '';
      return `${leadingSpace}- ${trimmed}`;
    })
    .join('\n');
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

export function toggleBlockquote(text: string): string {
  const lines = text.split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  const allHaveBlockquote = nonEmpty.length === 0 || nonEmpty.every((l) => BLOCKQUOTE_RE.test(l));
  if (allHaveBlockquote) {
    return lines.map((l) => l.replace(BLOCKQUOTE_RE, '')).join('\n');
  }
  return lines.map((l) => (l.trim() ? `> ${l}` : l)).join('\n');
}

export function toggleCodeFence(text: string): string {
  const lines = text.split('\n');
  const hasFence = lines.length >= 2 && CODE_FENCE_RE.test(lines[0]) && CODE_FENCE_RE.test(lines[lines.length - 1]);
  if (hasFence) {
    return lines.slice(1, -1).join('\n');
  }
  return `\`\`\`\n${text}\n\`\`\``;
}

export function removeListMarkers(text: string): string {
  return linesMap(text, (l) => l.replace(LIST_MARKER_RE, '$1'));
}

export function increaseHeading(text: string): string {
  return linesMap(text, (l) => (l.startsWith('#') ? `#${l}` : `# ${l}`));
}

export function decreaseHeading(text: string): string {
  return linesMap(text, (l) => (l.startsWith('##') ? l.slice(1) : l.startsWith('# ') ? l.slice(2) : l));
}
