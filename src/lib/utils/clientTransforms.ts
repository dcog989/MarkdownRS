import type { OperationId } from '$lib/config/textOperationsRegistry';

export function applyClientTransform(text: string, operationId: OperationId, indentWidth: number = 2): string {
    const lines = text.split('\n');

    switch (operationId) {
        // --- Sort & Order ---
        case 'sort-asc':
            return lines.slice().sort().join('\n');
        case 'sort-desc':
            return lines.slice().sort().reverse().join('\n');
        case 'sort-case-insensitive-asc':
            return lines
                .slice()
                .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                .join('\n');
        case 'sort-case-insensitive-desc':
            return lines
                .slice()
                .sort((a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' }))
                .join('\n');
        case 'sort-numeric-asc':
            return lines
                .slice()
                .sort((a, b) => extractNumber(a) - extractNumber(b))
                .join('\n');
        case 'sort-numeric-desc':
            return lines
                .slice()
                .sort((a, b) => extractNumber(b) - extractNumber(a))
                .join('\n');
        case 'sort-length-asc':
            return lines
                .slice()
                .sort((a, b) => a.length - b.length)
                .join('\n');
        case 'sort-length-desc':
            return lines
                .slice()
                .sort((a, b) => b.length - a.length)
                .join('\n');
        case 'reverse':
            return lines.slice().reverse().join('\n');
        case 'shuffle':
            return shuffle(lines).join('\n');

        // --- Remove & Filter ---
        case 'remove-duplicates': {
            const seen = new Set<string>();
            return lines
                .filter((l) => {
                    if (seen.has(l)) return false;
                    seen.add(l);
                    return true;
                })
                .join('\n');
        }
        case 'remove-unique': {
            const counts = new Map<string, number>();
            lines.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
            return lines.filter((l) => counts.get(l)! > 1).join('\n');
        }
        case 'remove-blank':
            return lines.filter((l) => l.trim().length > 0).join('\n');
        case 'remove-trailing-spaces':
            return lines.map((l) => l.trimEnd()).join('\n');
        case 'remove-leading-spaces':
            return lines.map((l) => l.trimStart()).join('\n');
        case 'remove-all-spaces':
            return lines
                .map((l) => l.replace(/\s+/g, ''))
                .filter((l) => l.length > 0)
                .join('\n');

        // --- Case Transformations ---
        case 'uppercase':
            return text.toUpperCase();
        case 'lowercase':
            return text.toLowerCase();
        case 'invert-case':
            return text
                .split('')
                .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
                .join('');
        case 'title-case':
            return lines.map((line) => line.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())).join('\n');
        case 'sentence-case':
            return lines.map((line) => line.charAt(0).toUpperCase() + line.slice(1).toLowerCase()).join('\n');
        case 'camel-case':
            return lines.map(toCamelCase).join('\n');
        case 'pascal-case':
            return lines.map(toPascalCase).join('\n');
        case 'snake-case':
            return lines.map(toSnakeCase).join('\n');
        case 'kebab-case':
            return lines.map(toKebabCase).join('\n');
        case 'constant-case':
            return lines.map((l) => toSnakeCase(l).toUpperCase()).join('\n');

        // --- Markdown ---
        case 'add-bullets': {
            return lines
                .map((l) => {
                    const trimmed = l.trim();
                    if (!trimmed) return l; // Keep blank lines as-is
                    // Check if already has a bullet
                    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
                        return l; // Already has a bullet or number
                    }
                    // Add bullet while preserving original indentation
                    const leadingSpace = l.match(/^\s*/)?.[0] || '';
                    return `${leadingSpace}- ${trimmed}`;
                })
                .join('\n');
        }
        case 'add-numbers': {
            let num = 1;
            return lines
                .map((l) => {
                    const trimmed = l.trim();
                    if (!trimmed) return l;
                    return `${num++}. ${trimmed}`;
                })
                .join('\n');
        }
        case 'add-checkboxes':
            return lines
                .map((l) => {
                    const trimmed = l.trim();
                    if (!trimmed) return l;
                    return `- [ ] ${trimmed}`;
                })
                .join('\n');
        case 'remove-bullets':
            return lines.map((l) => l.replace(/^(\s*)(-|\*|\+|[0-9]+\.|- \[[ x]\])\s+/, '$1')).join('\n');
        case 'blockquote':
            return lines.map((l) => (l.trim() ? `> ${l}` : l)).join('\n');
        case 'remove-blockquote':
            return lines.map((l) => l.replace(/^>\s?/, '')).join('\n');
        case 'add-code-fence':
            return `\`\`\`\n${text}\n\`\`\``;
        case 'increase-heading':
            return lines.map((l) => (l.startsWith('#') ? `#${l}` : `# ${l}`)).join('\n');
        case 'decrease-heading':
            return lines.map((l) => (l.startsWith('##') ? l.slice(1) : l.startsWith('# ') ? l.slice(2) : l)).join('\n');

        // --- Text Manipulation ---
        case 'trim-whitespace':
            return lines.map((l) => l.trim()).join('\n');
        case 'normalize-whitespace':
            return lines.map((l) => l.replace(/\s+/g, ' ')).join('\n');
        case 'join-lines':
            return lines
                .map((l) => l.trim())
                .filter((l) => l)
                .join(' ');
        case 'split-sentences':
            return text.replace(/([.!?])\s+(?=[A-Z])/g, '$1\n');
        case 'wrap-quotes':
            return lines
                .map((l) => {
                    const trimmed = l.trim();
                    if (!trimmed) return l;
                    return `"${trimmed}"`;
                })
                .join('\n');
        case 'add-line-numbers': {
            const pad = String(lines.length).length;
            return lines
                .map((l, i) => {
                    const trimmed = l.trim();
                    if (!trimmed) return l;
                    return `${String(i + 1).padStart(pad)}. ${trimmed}`;
                })
                .join('\n');
        }
        case 'indent-lines': {
            const indent = ' '.repeat(indentWidth);
            return lines
                .map((l) => {
                    const trimmed = l.trim();
                    if (!trimmed) return l;
                    const leadingSpace = l.match(/^\s*/)?.[0] || '';
                    return `${leadingSpace}${indent}${trimmed}`;
                })
                .join('\n');
        }
        case 'unindent-lines':
            const regex = new RegExp(`^ {1,${indentWidth}}`);
            return lines.map((l) => l.replace(regex, '')).join('\n');

        default:
            return text;
    }
}

// Helpers
function extractNumber(str: string): number {
    const match = str.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
}

function shuffle(array: string[]): string[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function toCamelCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
        .trim()
        .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function toPascalCase(str: string): string {
    const camel = toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toSnakeCase(str: string): string {
    return (
        str
            .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
            ?.map((x) => x.toLowerCase())
            .join('_') || str
    );
}

function toKebabCase(str: string): string {
    return toSnakeCase(str).replace(/_/g, '-');
}
