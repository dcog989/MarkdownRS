import { linesMap } from './helpers';

const SENTENCE_CASE_PREFIX_RE = /^(\s*)(-|\*|\+|[0-9]+\.|-\s*\[[ x]\])\s*(.*)$/;
const SNAKE_CASE_RE = /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g;

export function invertCase(text: string): string {
  return text
    .split('')
    .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
    .join('');
}

export function toTitleCase(text: string): string {
  return linesMap(text, (l) => l.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase()));
}

export function toSentenceCase(text: string): string {
  return linesMap(text, (line) => {
    const match = line.match(SENTENCE_CASE_PREFIX_RE);
    if (match) {
      const [, indent, prefix, content] = match;
      if (!content) return line;
      return `${indent}${prefix} ${content.charAt(0).toUpperCase()}${content.slice(1).toLowerCase()}`;
    }
    return line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
  });
}

export function toCamelCase(text: string): string {
  return linesMap(text, (l) =>
    l
      .trim()
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^[A-Z]/, (c) => c.toLowerCase()),
  );
}

export function toPascalCase(text: string): string {
  return linesMap(toCamelCase(text), (l) => l.charAt(0).toUpperCase() + l.slice(1));
}

export function toSnakeCase(text: string): string {
  return linesMap(
    text,
    (l) =>
      l
        .match(SNAKE_CASE_RE)
        ?.map((x) => x.toLowerCase())
        .join('_') || l,
  );
}

export function toKebabCase(text: string): string {
  return toSnakeCase(text).replace(/_/g, '-');
}

export function toConstantCase(text: string): string {
  return toSnakeCase(text).toUpperCase();
}
