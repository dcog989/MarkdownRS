import type { OperationTypeString } from "$lib/stores/editorStore.svelte";
import {
    ArrowDown01,
    ArrowDown10,
    ArrowDownAZ,
    ArrowDownZA,
    CaseSensitive,
    CircleMinus,
    Eraser,
    FunnelX,
    Hash,
    List,
    TextAlignStart,
    Trash2,
    Type
} from "lucide-svelte";

export type TextOperationConfig = {
    id: OperationTypeString;
    label: string;
    description?: string;
    icon?: any;
};

export type OperationCategory = {
    title: string;
    icon: any;
    operations: TextOperationConfig[];
};

export const TEXT_OPERATIONS: OperationCategory[] = [
    {
        title: "Sort & Order",
        icon: ArrowDownAZ,
        operations: [
            { id: "sort-asc", label: "Ascending", description: "Sort lines alphabetically A to Z", icon: ArrowDownAZ },
            { id: "sort-desc", label: "Descending", description: "Sort lines alphabetically Z to A", icon: ArrowDownZA },
            { id: "sort-case-insensitive-asc", label: "Ascending (Ignore Case)", description: "Sort A to Z ignoring case", icon: ArrowDownAZ },
            { id: "sort-case-insensitive-desc", label: "Descending (Ignore Case)", description: "Sort Z to A ignoring case", icon: ArrowDownZA },
            { id: "sort-numeric-asc", label: "Numeric Ascending", description: "Sort lines numerically (0-9)", icon: ArrowDown01 },
            { id: "sort-numeric-desc", label: "Numeric Descending", description: "Sort lines numerically (9-0)", icon: ArrowDown10 },
            { id: "sort-length-asc", label: "By Shortest", description: "Sort by line length ascending", icon: ArrowDownAZ },
            { id: "sort-length-desc", label: "By Longest", description: "Sort by line length descending", icon: ArrowDownZA },
            { id: "reverse", label: "Reverse", description: "Reverse the order of all lines", icon: ArrowDownZA },
            { id: "shuffle", label: "Shuffle", description: "Randomly shuffle line order", icon: FunnelX },
        ],
    },
    {
        title: "Remove & Filter",
        icon: Trash2,
        operations: [
            { id: "remove-duplicates", label: "Remove Duplicates", description: "Keep only unique lines", icon: Eraser },
            { id: "remove-unique", label: "Remove Unique", description: "Keep only duplicate lines", icon: FunnelX },
            { id: "remove-blank", label: "Remove Blank Lines", description: "Remove all empty lines", icon: CircleMinus },
            { id: "remove-trailing-spaces", label: "Remove Trailing Spaces", description: "Trim whitespace from line ends", icon: Eraser },
            { id: "remove-leading-spaces", label: "Remove Leading Spaces", description: "Trim whitespace from line starts", icon: Eraser },
            { id: "remove-all-spaces", label: "Remove All Spaces", description: "Remove all whitespace characters", icon: Eraser },
        ],
    },
    {
        title: "Case Transformations",
        icon: CaseSensitive,
        operations: [
            { id: "uppercase", label: "UPPER CASE", description: "Convert all text to uppercase", icon: Type },
            { id: "lowercase", label: "lower case", description: "Convert all text to lowercase", icon: Type },
            { id: "title-case", label: "Title Case", description: "Capitalize first letter of each word", icon: Type },
            { id: "sentence-case", label: "Sentence case", description: "Capitalize first letter of sentences", icon: Type },
            { id: "camel-case", label: "camelCase", description: "Convert to camelCase format", icon: Type },
            { id: "pascal-case", label: "PascalCase", description: "Convert to PascalCase format", icon: Type },
            { id: "snake-case", label: "snake_case", description: "Convert to snake_case format", icon: Type },
            { id: "kebab-case", label: "kebab-case", description: "Convert to kebab-case format", icon: Type },
            { id: "constant-case", label: "CONSTANT_CASE", description: "Convert to CONSTANT_CASE format", icon: Type },
            { id: "invert-case", label: "iNVERT cASE", description: "Swap uppercase and lowercase", icon: Type },
        ],
    },
    {
        title: "Markdown Formatting",
        icon: Hash,
        operations: [
            { id: "add-bullets", label: "Add Bullet Points", description: "Prefix lines with '- '", icon: List },
            { id: "add-numbers", label: "Add Numbering", description: "Prefix lines with '1. 2. 3.'", icon: List },
            { id: "add-checkboxes", label: "Add Checkboxes", description: "Prefix lines with '- [ ]'", icon: List },
            { id: "remove-bullets", label: "Remove List Markers", description: "Remove bullets, numbers, checkboxes", icon: CircleMinus },
            { id: "blockquote", label: "Add Blockquote", description: "Prefix lines with '> '", icon: TextAlignStart },
            { id: "remove-blockquote", label: "Remove Blockquote", description: "Remove '> ' prefix", icon: CircleMinus },
            { id: "add-code-fence", label: "Wrap in Code Block", description: "Wrap with ``` fences", icon: Hash },
            { id: "increase-heading", label: "Increase Heading Level", description: "Add # to headings", icon: Hash },
            { id: "decrease-heading", label: "Decrease Heading Level", description: "Remove # from headings", icon: Hash },
        ],
    },
    {
        title: "Text Manipulation",
        icon: Type,
        operations: [
            { id: "trim-whitespace", label: "Trim Whitespace", description: "Trim leading and trailing spaces", icon: Eraser },
            { id: "normalize-whitespace", label: "Normalize Whitespace", description: "Replace multiple spaces with single", icon: Eraser },
            { id: "join-lines", label: "Join Lines", description: "Combine all lines into one", icon: TextAlignStart },
            { id: "split-sentences", label: "Sentences to new lines", description: "Each sentence on new line", icon: TextAlignStart },
            { id: "wrap-quotes", label: "Wrap in Quotes", description: "Wrap each line in quotes", icon: Type },
            { id: "add-line-numbers", label: "Number Each Line", description: "Prefix with line numbers", icon: List },
            { id: "indent-lines", label: "Indent Lines", description: "Indent each line by default spacing", icon: TextAlignStart },
            { id: "unindent-lines", label: "Unindent Lines", description: "Unindent each line by default spacing", icon: TextAlignStart },
        ],
    },
];

export function getOperationsByCategory(categoryTitle: string): TextOperationConfig[] {
    const category = TEXT_OPERATIONS.find(c => c.title === categoryTitle);
    return category ? category.operations : [];
}
