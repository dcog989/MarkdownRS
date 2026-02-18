/**
 * Consolidated Text Operations Registry
 *
 * This file serves as the single source of truth for all text operations.
 * It maps operation IDs to their metadata (label, description, icon) and
 * execution context (client vs server).
 */

import {
    ArrowDown01,
    ArrowDown10,
    ArrowDownAZ,
    ArrowDownZA,
    Bold,
    CaseSensitive,
    CircleMinus,
    Code,
    Eraser,
    FunnelX,
    Hash,
    Italic,
    Link,
    List,
    Strikethrough,
    TextAlignStart,
    Trash2,
    Type,
} from 'lucide-svelte';

/**
 * Operation ID type - all valid operation identifiers
 */
export type OperationId =
    // Sort & Order
    | 'sort-asc'
    | 'sort-case-insensitive-asc'
    | 'sort-numeric-asc'
    | 'sort-length-asc'
    | 'sort-desc'
    | 'sort-case-insensitive-desc'
    | 'sort-numeric-desc'
    | 'sort-length-desc'
    | 'reverse'
    | 'shuffle'
    // Remove & Filter
    | 'remove-duplicates'
    | 'remove-unique'
    | 'remove-blank'
    | 'remove-trailing-spaces'
    | 'remove-leading-spaces'
    | 'remove-all-spaces'
    // Case Transformations
    | 'uppercase'
    | 'lowercase'
    | 'title-case'
    | 'sentence-case'
    | 'camel-case'
    | 'pascal-case'
    | 'snake-case'
    | 'kebab-case'
    | 'constant-case'
    | 'invert-case'
    // Markdown Formatting
    | 'add-bullets'
    | 'add-numbers'
    | 'add-checkboxes'
    | 'format-document'
    | 'remove-bullets'
    | 'blockquote'
    | 'remove-blockquote'
    | 'add-code-fence'
    | 'increase-heading'
    | 'decrease-heading'
    | 'bold'
    | 'italic'
    | 'insert-link'
    | 'strike'
    | 'inline-code'
    // Text Manipulation
    | 'trim-whitespace'
    | 'normalize-whitespace'
    | 'join-lines'
    | 'split-sentences'
    | 'wrap-quotes'
    | 'add-line-numbers'
    | 'indent-lines'
    | 'unindent-lines';

/**
 * Operation definition with metadata and backend mapping
 */
export interface TextOperation {
    id: OperationId;
    label: string;
    description: string;
    icon: typeof ArrowDownAZ;
    category: string;
    execution: 'client' | 'server';
    /**
     * Backend command name - only needed if execution is 'server'.
     */
    backendCommand?: string;
}

/**
 * Category definition
 */
export interface OperationCategory {
    id: string;
    title: string;
    icon: typeof ArrowDownAZ;
}

/**
 * All operation categories
 */
export const OPERATION_CATEGORIES: OperationCategory[] = [
    { id: 'sort', title: 'Sort', icon: ArrowDownAZ },
    { id: 'filter', title: 'Remove', icon: Trash2 },
    { id: 'case', title: 'Case', icon: CaseSensitive },
    { id: 'markdown', title: 'Markdown', icon: Hash },
    { id: 'text', title: 'Text', icon: Type },
];

/**
 * Complete registry of all text operations
 */
export const TEXT_OPERATIONS_REGISTRY: Record<OperationId, TextOperation> = {
    // Sort & Order
    'sort-asc': {
        id: 'sort-asc',
        label: 'Ascending',
        description: 'Sort lines alphabetically A to Z',
        icon: ArrowDownAZ,
        category: 'sort',
        execution: 'client',
    },
    'sort-case-insensitive-asc': {
        id: 'sort-case-insensitive-asc',
        label: 'Ascending (Ignore Case)',
        description: 'Sort A to Z ignoring case',
        icon: ArrowDownAZ,
        category: 'sort',
        execution: 'client',
    },
    'sort-numeric-asc': {
        id: 'sort-numeric-asc',
        label: 'Ascending (Numeric)',
        description: 'Sort lines numerically (0-9)',
        icon: ArrowDown01,
        category: 'sort',
        execution: 'client',
    },
    'sort-length-asc': {
        id: 'sort-length-asc',
        label: 'Ascending (By Length)',
        description: 'Sort by line length ascending',
        icon: ArrowDownAZ,
        category: 'sort',
        execution: 'client',
    },
    'sort-desc': {
        id: 'sort-desc',
        label: 'Descending',
        description: 'Sort lines alphabetically Z to A',
        icon: ArrowDownZA,
        category: 'sort',
        execution: 'client',
    },
    'sort-case-insensitive-desc': {
        id: 'sort-case-insensitive-desc',
        label: 'Descending (Ignore Case)',
        description: 'Sort Z to A ignoring case',
        icon: ArrowDownZA,
        category: 'sort',
        execution: 'client',
    },
    'sort-numeric-desc': {
        id: 'sort-numeric-desc',
        label: 'Descending (Numeric)',
        description: 'Sort lines numerically (9-0)',
        icon: ArrowDown10,
        category: 'sort',
        execution: 'client',
    },
    'sort-length-desc': {
        id: 'sort-length-desc',
        label: 'Descending (By Length)',
        description: 'Sort by line length descending',
        icon: ArrowDownZA,
        category: 'sort',
        execution: 'client',
    },
    reverse: {
        id: 'reverse',
        label: 'Reverse',
        description: 'Reverse the order of all lines',
        icon: ArrowDownZA,
        category: 'sort',
        execution: 'client',
    },
    shuffle: {
        id: 'shuffle',
        label: 'Shuffle',
        description: 'Randomly shuffle line order',
        icon: FunnelX,
        category: 'sort',
        execution: 'client',
    },

    // Remove & Filter
    'remove-duplicates': {
        id: 'remove-duplicates',
        label: 'Remove Duplicates',
        description: 'Keep only unique lines',
        icon: Eraser,
        category: 'filter',
        execution: 'client',
    },
    'remove-unique': {
        id: 'remove-unique',
        label: 'Remove Unique',
        description: 'Keep only duplicate lines',
        icon: FunnelX,
        category: 'filter',
        execution: 'client',
    },
    'remove-blank': {
        id: 'remove-blank',
        label: 'Remove Blank Lines',
        description: 'Remove all empty lines',
        icon: CircleMinus,
        category: 'filter',
        execution: 'client',
    },
    'remove-trailing-spaces': {
        id: 'remove-trailing-spaces',
        label: 'Remove Trailing Spaces',
        description: 'Trim whitespace from line ends',
        icon: Eraser,
        category: 'filter',
        execution: 'client',
    },
    'remove-leading-spaces': {
        id: 'remove-leading-spaces',
        label: 'Remove Leading Whitespace',
        description: 'Trim whitespace from line starts',
        icon: Eraser,
        category: 'filter',
        execution: 'client',
    },
    'remove-all-spaces': {
        id: 'remove-all-spaces',
        label: 'Remove All Whitespace',
        description: 'Remove all whitespace characters',
        icon: Eraser,
        category: 'filter',
        execution: 'client',
    },

    // Case Transformations
    uppercase: {
        id: 'uppercase',
        label: 'UPPER CASE',
        description: 'Convert all text to upper case',
        icon: Type,
        category: 'case',
        execution: 'client',
    },
    lowercase: {
        id: 'lowercase',
        label: 'lower case',
        description: 'Convert all text to lower case',
        icon: Type,
        category: 'case',
        execution: 'client',
    },
    'title-case': {
        id: 'title-case',
        label: 'Title Case',
        description: 'Capitalize first letter of each word',
        icon: Type,
        category: 'case',
        execution: 'client',
    },
    'sentence-case': {
        id: 'sentence-case',
        label: 'Sentence case',
        description: 'Capitalize first letter of sentences',
        icon: Type,
        category: 'case',
        execution: 'client',
    },
    'camel-case': {
        id: 'camel-case',
        label: 'camelCase',
        description: 'Convert to camelCase format',
        icon: Type,
        category: 'case',
        execution: 'client',
    },
    'pascal-case': {
        id: 'pascal-case',
        label: 'PascalCase',
        description: 'Convert to PascalCase format',
        icon: Type,
        category: 'case',
        execution: 'client',
    },
    'snake-case': {
        id: 'snake-case',
        label: 'snake_case',
        description: 'Convert to snake_case format',
        icon: Type,
        category: 'case',
        execution: 'client',
    },
    'kebab-case': {
        id: 'kebab-case',
        label: 'kebab-case',
        description: 'Convert to kebab-case format',
        icon: Type,
        category: 'case',
        execution: 'client',
    },
    'constant-case': {
        id: 'constant-case',
        label: 'CONSTANT_CASE',
        description: 'Convert to CONSTANT_CASE format',
        icon: Type,
        category: 'case',
        execution: 'client',
    },
    'invert-case': {
        id: 'invert-case',
        label: 'iNVERT cASE',
        description: 'Swap uppercase and lowercase',
        icon: Type,
        category: 'case',
        execution: 'client',
    },

    // Markdown Formatting
    'add-bullets': {
        id: 'add-bullets',
        label: 'Add Bullet Points',
        description: "Prefix lines with '- '",
        icon: List,
        category: 'markdown',
        execution: 'client',
    },
    'add-numbers': {
        id: 'add-numbers',
        label: 'Add Numbering',
        description: "Prefix lines with '1. 2. 3.'",
        icon: List,
        category: 'markdown',
        execution: 'client',
    },
    'add-checkboxes': {
        id: 'add-checkboxes',
        label: 'Add Checkboxes',
        description: "Prefix lines with '- [ ]'",
        icon: List,
        category: 'markdown',
        execution: 'client',
    },
    'format-document': {
        id: 'format-document',
        label: 'Format Document',
        description: 'Format markdown document',
        icon: Type,
        category: 'markdown',
        execution: 'server',
        backendCommand: 'format_markdown',
    },
    'remove-bullets': {
        id: 'remove-bullets',
        label: 'Remove List Markers',
        description: 'Remove bullets, numbers, checkboxes',
        icon: CircleMinus,
        category: 'markdown',
        execution: 'client',
    },
    blockquote: {
        id: 'blockquote',
        label: 'Add Blockquote',
        description: "Prefix lines with '> '",
        icon: TextAlignStart,
        category: 'markdown',
        execution: 'client',
    },
    'remove-blockquote': {
        id: 'remove-blockquote',
        label: 'Remove Blockquote',
        description: "Remove '> ' prefix",
        icon: CircleMinus,
        category: 'markdown',
        execution: 'client',
    },
    'add-code-fence': {
        id: 'add-code-fence',
        label: 'Wrap in Code Block',
        description: 'Wrap with ``` fences',
        icon: Hash,
        category: 'markdown',
        execution: 'client',
    },
    'increase-heading': {
        id: 'increase-heading',
        label: 'Increase Heading Level',
        description: 'Add # to headings',
        icon: Hash,
        category: 'markdown',
        execution: 'client',
    },
    'decrease-heading': {
        id: 'decrease-heading',
        label: 'Decrease Heading Level',
        description: 'Remove # from headings',
        icon: Hash,
        category: 'markdown',
        execution: 'client',
    },
    bold: {
        id: 'bold',
        label: 'Bold',
        description: 'Wrap selection in **',
        icon: Bold,
        category: 'markdown',
        execution: 'client',
    },
    italic: {
        id: 'italic',
        label: 'Italic',
        description: 'Wrap selection in *',
        icon: Italic,
        category: 'markdown',
        execution: 'client',
    },
    'insert-link': {
        id: 'insert-link',
        label: 'Insert Link',
        description: 'Wrap selection in [text](url)',
        icon: Link,
        category: 'markdown',
        execution: 'client',
    },
    strike: {
        id: 'strike',
        label: 'Strikethrough',
        description: 'Wrap selection in ~~',
        icon: Strikethrough,
        category: 'markdown',
        execution: 'client',
    },
    'inline-code': {
        id: 'inline-code',
        label: 'Inline Code',
        description: 'Wrap selection in `',
        icon: Code,
        category: 'markdown',
        execution: 'client',
    },

    // Text Manipulation
    'trim-whitespace': {
        id: 'trim-whitespace',
        label: 'Trim Whitespace',
        description: 'Trim leading and trailing spaces',
        icon: Eraser,
        category: 'text',
        execution: 'client',
    },
    'normalize-whitespace': {
        id: 'normalize-whitespace',
        label: 'Normalize Whitespace',
        description: 'Replace multiple spaces with single',
        icon: Eraser,
        category: 'text',
        execution: 'client',
    },
    'join-lines': {
        id: 'join-lines',
        label: 'Join Lines',
        description: 'Combine all lines into one',
        icon: TextAlignStart,
        category: 'text',
        execution: 'client',
    },
    'split-sentences': {
        id: 'split-sentences',
        label: 'Sentences to new lines',
        description: 'Each sentence on new line',
        icon: TextAlignStart,
        category: 'text',
        execution: 'client',
    },
    'wrap-quotes': {
        id: 'wrap-quotes',
        label: 'Wrap in Quotes',
        description: 'Wrap each line in quotes',
        icon: Type,
        category: 'text',
        execution: 'client',
    },
    'add-line-numbers': {
        id: 'add-line-numbers',
        label: 'Number Each Line',
        description: 'Prefix with line numbers',
        icon: List,
        category: 'text',
        execution: 'client',
    },
    'indent-lines': {
        id: 'indent-lines',
        label: 'Indent Lines',
        description: 'Indent each line by default spacing',
        icon: TextAlignStart,
        category: 'text',
        execution: 'client',
    },
    'unindent-lines': {
        id: 'unindent-lines',
        label: 'Unindent Lines',
        description: 'Unindent each line by default spacing',
        icon: TextAlignStart,
        category: 'text',
        execution: 'client',
    },
};

/**
 * Get operation metadata by ID
 */
export function getOperation(id: OperationId): TextOperation | undefined {
    return TEXT_OPERATIONS_REGISTRY[id];
}

/**
 * Get all operations for a category
 */
export function getOperationsByCategory(categoryId: string): TextOperation[] {
    return Object.values(TEXT_OPERATIONS_REGISTRY).filter((op) => op.category === categoryId);
}

/**
 * Validate that an operation ID exists
 */
export function isValidOperationId(id: string): id is OperationId {
    return id in TEXT_OPERATIONS_REGISTRY;
}
