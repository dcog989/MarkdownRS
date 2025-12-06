// Text transformation utilities for the editor

export function transformText(text: string, operation: string): string {
    const lines = text.split('\n');
    
    switch (operation) {
        // Sort operations
        case 'sort-lines': // Legacy
        case 'sort-asc':
            return lines.sort((a, b) => a.localeCompare(b)).join('\n');
            
        case 'sort-desc':
            return lines.sort((a, b) => b.localeCompare(a)).join('\n');
            
        case 'sort-numeric-asc':
            return lines.sort((a, b) => {
                const numA = parseFloat(a.match(/\d+\.?\d*/)?.[0] || '0');
                const numB = parseFloat(b.match(/\d+\.?\d*/)?.[0] || '0');
                return numA - numB;
            }).join('\n');
            
        case 'sort-numeric-desc':
            return lines.sort((a, b) => {
                const numA = parseFloat(a.match(/\d+\.?\d*/)?.[0] || '0');
                const numB = parseFloat(b.match(/\d+\.?\d*/)?.[0] || '0');
                return numB - numA;
            }).join('\n');
            
        case 'sort-length-asc':
            return lines.sort((a, b) => a.length - b.length).join('\n');
            
        case 'sort-length-desc':
            return lines.sort((a, b) => b.length - a.length).join('\n');
            
        case 'reverse':
            return lines.reverse().join('\n');
            
        case 'shuffle':
            const shuffled = [...lines];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled.join('\n');
            
        // Remove operations
        case 'remove-duplicates':
            return [...new Set(lines)].join('\n');
            
        case 'remove-unique': {
            const counts = new Map<string, number>();
            lines.forEach(line => counts.set(line, (counts.get(line) || 0) + 1));
            return lines.filter(line => (counts.get(line) || 0) > 1).join('\n');
        }
            
        case 'remove-blank':
            return lines.filter(line => line.trim().length > 0).join('\n');
            
        case 'remove-trailing-spaces':
            return lines.map(line => line.replace(/\s+$/, '')).join('\n');
            
        case 'remove-leading-spaces':
            return lines.map(line => line.replace(/^\s+/, '')).join('\n');
            
        case 'remove-all-spaces':
            return text.replace(/\s+/g, '');
            
        // Case operations
        case 'to-uppercase': // Legacy
        case 'uppercase':
            return text.toUpperCase();
            
        case 'to-lowercase': // Legacy
        case 'lowercase':
            return text.toLowerCase();
            
        case 'title-case':
            return lines.map(line => 
                line.replace(/\w\S*/g, word => 
                    word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()
                )
            ).join('\n');
            
        case 'sentence-case':
            return text.replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase());
            
        case 'camel-case':
            return text
                .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => 
                    index === 0 ? letter.toLowerCase() : letter.toUpperCase()
                )
                .replace(/\s+/g, '');
                
        case 'pascal-case':
            return text
                .replace(/(?:^\w|[A-Z]|\b\w)/g, letter => letter.toUpperCase())
                .replace(/\s+/g, '');
                
        case 'snake-case':
            return text
                .replace(/\W+/g, ' ')
                .split(/ |\B(?=[A-Z])/)
                .map(word => word.toLowerCase())
                .join('_');
                
        case 'kebab-case':
            return text
                .replace(/\W+/g, ' ')
                .split(/ |\B(?=[A-Z])/)
                .map(word => word.toLowerCase())
                .join('-');
                
        case 'constant-case':
            return text
                .replace(/\W+/g, ' ')
                .split(/ |\B(?=[A-Z])/)
                .map(word => word.toUpperCase())
                .join('_');
                
        case 'invert-case':
            return text.split('').map(char => 
                char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()
            ).join('');
            
        // Markdown operations
        case 'add-bullets':
            return lines.map(line => line.trim() ? `- ${line}` : line).join('\n');
            
        case 'add-numbers':
            let number = 1;
            return lines.map(line => line.trim() ? `${number++}. ${line}` : line).join('\n');
            
        case 'add-checkboxes':
            return lines.map(line => line.trim() ? `- [ ] ${line}` : line).join('\n');
            
        case 'remove-bullets':
            return lines.map(line => 
                line.replace(/^\s*[-*+]\s+/, '')
                    .replace(/^\s*\d+\.\s+/, '')
                    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '')
            ).join('\n');
            
        case 'blockquote':
            return lines.map(line => line.trim() ? `> ${line}` : line).join('\n');
            
        case 'remove-blockquote':
            return lines.map(line => line.replace(/^\s*>\s*/, '')).join('\n');
            
        case 'add-code-fence':
            return '```\n' + text + '\n```';
            
        case 'increase-heading':
            return lines.map(line => {
                if (line.match(/^#{1,5}\s/)) {
                    return '#' + line;
                }
                return line;
            }).join('\n');
            
        case 'decrease-heading':
            return lines.map(line => {
                if (line.match(/^#{2,6}\s/)) {
                    return line.substring(1);
                }
                return line;
            }).join('\n');
            
        // Text manipulation
        case 'trim-whitespace':
            return lines.map(line => line.trim()).join('\n');
            
        case 'normalize-whitespace':
            return lines.map(line => line.replace(/\s+/g, ' ').trim()).join('\n');
            
        case 'join-lines':
            return lines.map(l => l.trim()).filter(l => l).join(' ');
            
        case 'split-sentences':
            return text
                .replace(/([.!?])\s+/g, '$1\n')
                .split('\n')
                .map(s => s.trim())
                .filter(s => s)
                .join('\n');
                
        case 'wrap-quotes':
            return lines.map(line => line.trim() ? `"${line}"` : line).join('\n');
            
        case 'add-line-numbers': {
            const maxDigits = lines.length.toString().length;
            return lines.map((line, i) => 
                `${(i + 1).toString().padStart(maxDigits, ' ')}. ${line}`
            ).join('\n');
        }
            
        case 'indent-lines':
            return lines.map(line => line.trim() ? `    ${line}` : line).join('\n');
            
        case 'unindent-lines':
            return lines.map(line => line.replace(/^    /, '')).join('\n');
            
        default:
            return text;
    }
}
