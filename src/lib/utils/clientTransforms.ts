/**
 * Atomic logic for client-side text transformations.
 */

const SENTENCE_CASE_PREFIX_RE = /^(\s*)(-|\*|\+|[0-9]+\.|-\s*\[[ x]\])\s*(.*)$/;
const SNAKE_CASE_RE = /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g;
const BULLET_RE = /^[-*+]\s/;
const NUMBER_RE = /^\d+\.\s/;
const INDENT_RE = /^\s*/;
const BULLET_REPLACE_RE = /^(\s*)(-|\*|\+|[0-9]+\.|- \[[ x]\])\s+/;
const BLOCKQUOTE_RE = /^>\s?/;
const WHITESPACE_RE = /\s+/g;
const SENTENCE_SPLIT_RE = /([.!?])\s+(?=[A-Z])/g;
const NUMBER_EXTRACT_RE = /-?\d+(\.\d+)?/;

function extractNumber(str: string): number {
    const match = str.match(NUMBER_EXTRACT_RE);
    return match ? parseFloat(match[0]) : 0;
}

export function sortLines(text: string, mode: string): string {
    const lines = text.split('\n');
    switch (mode) {
        case 'asc':
            return lines.sort().join('\n');
        case 'desc':
            return lines.sort().reverse().join('\n');
        case 'case-insensitive-asc':
            return lines.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join('\n');
        case 'case-insensitive-desc':
            return lines.sort((a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' })).join('\n');
        case 'numeric-asc':
            return lines.sort((a, b) => extractNumber(a) - extractNumber(b)).join('\n');
        case 'numeric-desc':
            return lines.sort((a, b) => extractNumber(b) - extractNumber(a)).join('\n');
        case 'length-asc':
            return lines.sort((a, b) => a.length - b.length).join('\n');
        case 'length-desc':
            return lines.sort((a, b) => b.length - a.length).join('\n');
        default:
            return text;
    }
}

export function reverseLines(text: string): string {
    return text.split('\n').reverse().join('\n');
}

export function shuffleLines(text: string): string {
    const arr = text.split('\n');
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('\n');
}

export function removeDuplicates(text: string): string {
    const seen = new Set<string>();
    return text
        .split('\n')
        .filter((l) => (seen.has(l) ? false : !!seen.add(l)))
        .join('\n');
}

export function removeUnique(text: string): string {
    const lines = text.split('\n');
    const counts = new Map<string, number>();
    lines.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
    return lines.filter((l) => counts.get(l)! > 1).join('\n');
}

export function removeBlankLines(text: string): string {
    return text
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .join('\n');
}

export function removeTrailingSpaces(text: string): string {
    return text
        .split('\n')
        .map((l) => l.trimEnd())
        .join('\n');
}

export function removeLeadingSpaces(text: string): string {
    return text
        .split('\n')
        .map((l) => l.trimStart())
        .join('\n');
}

export function removeAllSpaces(text: string): string {
    return text
        .split('\n')
        .map((l) => l.replace(/\s+/g, ''))
        .filter((l) => l.length > 0)
        .join('\n');
}

export function invertCase(text: string): string {
    return text
        .split('')
        .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
        .join('');
}

export function toTitleCase(text: string): string {
    return text
        .split('\n')
        .map((line) => line.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase()))
        .join('\n');
}

export function toSentenceCase(text: string): string {
    return text
        .split('\n')
        .map((line) => {
            const match = line.match(SENTENCE_CASE_PREFIX_RE);
            if (match) {
                const [, indent, prefix, content] = match;
                if (!content) return line;
                return `${indent}${prefix} ${content.charAt(0).toUpperCase()}${content.slice(1).toLowerCase()}`;
            }
            return line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
        })
        .join('\n');
}

export function toCamelCase(text: string): string {
    return text
        .split('\n')
        .map((l) =>
            l
                .trim()
                .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
                .replace(/^[A-Z]/, (c) => c.toLowerCase()),
        )
        .join('\n');
}

export function toPascalCase(text: string): string {
    return text
        .split('\n')
        .map((l) => {
            const camel = l
                .trim()
                .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
                .replace(/^[A-Z]/, (c) => c.toLowerCase());
            return camel.charAt(0).toUpperCase() + camel.slice(1);
        })
        .join('\n');
}

export function toSnakeCase(text: string): string {
    return text
        .split('\n')
        .map(
            (l) =>
                l
                    .match(SNAKE_CASE_RE)
                    ?.map((x) => x.toLowerCase())
                    .join('_') || l,
        )
        .join('\n');
}

export function toKebabCase(text: string): string {
    return text
        .split('\n')
        .map((l) =>
            (
                l
                    .match(SNAKE_CASE_RE)
                    ?.map((x) => x.toLowerCase())
                    .join('_') || l
            ).replace(/_/g, '-'),
        )
        .join('\n');
}

export function toConstantCase(text: string): string {
    return text
        .split('\n')
        .map((l) =>
            (
                l
                    .match(SNAKE_CASE_RE)
                    ?.map((x) => x.toLowerCase())
                    .join('_') || l
            ).toUpperCase(),
        )
        .join('\n');
}

export function addBullets(text: string): string {
    return text
        .split('\n')
        .map((l) => {
            const trimmed = l.trim();
            if (!trimmed || BULLET_RE.test(trimmed) || NUMBER_RE.test(trimmed)) return l;
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
    return text
        .split('\n')
        .map((l) => (l.trim() ? `- [ ] ${l.trim()}` : l))
        .join('\n');
}

export function removeListMarkers(text: string): string {
    return text
        .split('\n')
        .map((l) => l.replace(BULLET_REPLACE_RE, '$1'))
        .join('\n');
}

export function addBlockquote(text: string): string {
    return text
        .split('\n')
        .map((l) => (l.trim() ? `> ${l}` : l))
        .join('\n');
}

export function removeBlockquote(text: string): string {
    return text
        .split('\n')
        .map((l) => l.replace(BLOCKQUOTE_RE, ''))
        .join('\n');
}

export function addCodeFence(text: string): string {
    return `\`\`\`\n${text}\n\`\`\``;
}

export function increaseHeading(text: string): string {
    return text
        .split('\n')
        .map((l) => (l.startsWith('#') ? `#${l}` : `# ${l}`))
        .join('\n');
}

export function decreaseHeading(text: string): string {
    return text
        .split('\n')
        .map((l) => (l.startsWith('##') ? l.slice(1) : l.startsWith('# ') ? l.slice(2) : l))
        .join('\n');
}

export function trimWhitespace(text: string): string {
    return text
        .split('\n')
        .map((l) => l.trim())
        .join('\n');
}

export function normalizeWhitespace(text: string): string {
    return text
        .split('\n')
        .map((l) => l.replace(WHITESPACE_RE, ' '))
        .join('\n');
}

export function joinLines(text: string): string {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l)
        .join(' ');
}

export function splitSentences(text: string): string {
    return text.replace(SENTENCE_SPLIT_RE, '$1\n');
}

export function wrapQuotes(text: string): string {
    return text
        .split('\n')
        .map((l) => (l.trim() ? `"${l.trim()}"` : l))
        .join('\n');
}

export function addLineNumbers(text: string): string {
    const lines = text.split('\n');
    const pad = String(lines.length).length;
    return lines.map((l, i) => (l.trim() ? `${String(i + 1).padStart(pad)}. ${l.trim()}` : l)).join('\n');
}

export function indentLines(text: string, width: number): string {
    const indent = ' '.repeat(width);
    return text
        .split('\n')
        .map((l) => (l.trim() ? `${l.match(INDENT_RE)?.[0] || ''}${indent}${l.trim()}` : l))
        .join('\n');
}

export function unindentLines(text: string, width: number): string {
    const regex = new RegExp(`^ {1,${width}}`);
    return text
        .split('\n')
        .map((l) => l.replace(regex, ''))
        .join('\n');
}
