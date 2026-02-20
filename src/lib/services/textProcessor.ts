import { getOperation, type OperationId } from '$lib/config/textOperationsRegistry';
import { appContext } from '$lib/stores/state.svelte.ts';
import * as ClientLogic from '$lib/utils/clientTransforms';
import { formatMarkdown } from '$lib/utils/formatterRust';

export type TransformStrategy = (text: string, options?: unknown) => string | Promise<string>;

/**
 * TextProcessor Service
 * Implements a strategy pattern to provide a unified interface for all text transformations.
 */
class TextProcessor {
    private strategies = new Map<OperationId, TransformStrategy>();

    constructor() {
        this.initializeStrategies();
    }

    private initializeStrategies() {
        // --- Sort & Order ---
        this.strategies.set('sort-asc', (t) => ClientLogic.sortLines(t, 'asc'));
        this.strategies.set('sort-desc', (t) => ClientLogic.sortLines(t, 'desc'));
        this.strategies.set('sort-case-insensitive-asc', (t) =>
            ClientLogic.sortLines(t, 'case-insensitive-asc'),
        );
        this.strategies.set('sort-case-insensitive-desc', (t) =>
            ClientLogic.sortLines(t, 'case-insensitive-desc'),
        );
        this.strategies.set('sort-numeric-asc', (t) => ClientLogic.sortLines(t, 'numeric-asc'));
        this.strategies.set('sort-numeric-desc', (t) => ClientLogic.sortLines(t, 'numeric-desc'));
        this.strategies.set('sort-length-asc', (t) => ClientLogic.sortLines(t, 'length-asc'));
        this.strategies.set('sort-length-desc', (t) => ClientLogic.sortLines(t, 'length-desc'));
        this.strategies.set('reverse', ClientLogic.reverseLines);
        this.strategies.set('shuffle', ClientLogic.shuffleLines);

        // --- Remove & Filter ---
        this.strategies.set('remove-duplicates', ClientLogic.removeDuplicates);
        this.strategies.set('remove-unique', ClientLogic.removeUnique);
        this.strategies.set('remove-blank', ClientLogic.removeBlankLines);
        this.strategies.set('remove-trailing-spaces', ClientLogic.removeTrailingSpaces);
        this.strategies.set('remove-leading-spaces', ClientLogic.removeLeadingSpaces);
        this.strategies.set('remove-all-spaces', ClientLogic.removeAllSpaces);

        // --- Case Transformations ---
        this.strategies.set('uppercase', (t) => t.toUpperCase());
        this.strategies.set('lowercase', (t) => t.toLowerCase());
        this.strategies.set('invert-case', ClientLogic.invertCase);
        this.strategies.set('title-case', ClientLogic.toTitleCase);
        this.strategies.set('sentence-case', ClientLogic.toSentenceCase);
        this.strategies.set('camel-case', ClientLogic.toCamelCase);
        this.strategies.set('pascal-case', ClientLogic.toPascalCase);
        this.strategies.set('snake-case', ClientLogic.toSnakeCase);
        this.strategies.set('kebab-case', ClientLogic.toKebabCase);
        this.strategies.set('constant-case', ClientLogic.toConstantCase);

        // --- Markdown Formatting ---
        this.strategies.set('add-bullets', ClientLogic.addBullets);
        this.strategies.set('add-numbers', ClientLogic.addNumbers);
        this.strategies.set('add-checkboxes', ClientLogic.addCheckboxes);
        this.strategies.set('remove-bullets', ClientLogic.removeListMarkers);
        this.strategies.set('blockquote', ClientLogic.addBlockquote);
        this.strategies.set('remove-blockquote', ClientLogic.removeBlockquote);
        this.strategies.set('add-code-fence', ClientLogic.addCodeFence);
        this.strategies.set('increase-heading', ClientLogic.increaseHeading);
        this.strategies.set('decrease-heading', ClientLogic.decreaseHeading);
        this.strategies.set('bold', (t) => `**${t}**`);
        this.strategies.set('italic', (t) => `*${t}*`);
        this.strategies.set('strike', (t) => `~~${t}~~`);
        this.strategies.set('inline-code', (t) => `\`${t}\``);
        this.strategies.set('insert-link', (t) => `[${t}](https://)`);

        // --- Text Manipulation ---
        this.strategies.set('trim-whitespace', ClientLogic.trimWhitespace);
        this.strategies.set('normalize-whitespace', ClientLogic.normalizeWhitespace);
        this.strategies.set('join-lines', ClientLogic.joinLines);
        this.strategies.set('split-sentences', ClientLogic.splitSentences);
        this.strategies.set('wrap-quotes', ClientLogic.wrapQuotes);
        this.strategies.set('add-line-numbers', ClientLogic.addLineNumbers);
        this.strategies.set('indent-lines', (t) =>
            ClientLogic.indentLines(t, appContext.app.defaultIndent),
        );
        this.strategies.set('unindent-lines', (t) =>
            ClientLogic.unindentLines(t, appContext.app.defaultIndent),
        );
        this.strategies.set('smart-paragraphs', ClientLogic.smartParagraphs);
    }

    /**
     * Executes a transformation based on its ID.
     * Routes to server for 'server' execution types or local strategy for others.
     */
    async process(operationId: OperationId, text: string): Promise<string> {
        const op = getOperation(operationId);
        if (!op) return text;

        // Special case: Server-side formatting
        if (op.execution === 'server' && operationId === 'format-document') {
            return formatMarkdown(text);
        }

        const strategy = this.strategies.get(operationId);
        if (!strategy) {
            console.warn(`[TextProcessor] No strategy found for operation: ${operationId}`);
            return text;
        }

        return strategy(text);
    }
}

export const textProcessor = new TextProcessor();
