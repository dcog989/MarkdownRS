<script lang="ts">
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { AlignLeft, ArrowDown01, ArrowDown10, ArrowDownAz, ArrowDownZa, CaseSensitive, Eraser, FilterX, Hash, List, MinusCircle, Trash2, Type, X } from "lucide-svelte";

    let { isOpen = false, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

    type TransformCategory = {
        title: string;
        icon: any;
        operations: {
            id: string;
            label: string;
            description: string;
            icon: any;
        }[];
    };

    const categories: TransformCategory[] = [
        {
            title: "Sort & Order",
            icon: ArrowDownAz,
            operations: [
                { id: "sort-asc", label: "Sort Ascending (A-Z)", description: "Sort lines alphabetically A to Z", icon: ArrowDownAz },
                { id: "sort-desc", label: "Sort Descending (Z-A)", description: "Sort lines alphabetically Z to A", icon: ArrowDownZa },
                { id: "sort-numeric-asc", label: "Sort Numeric Ascending", description: "Sort lines numerically (1-9)", icon: ArrowDown01 },
                { id: "sort-numeric-desc", label: "Sort Numeric Descending", description: "Sort lines numerically (9-1)", icon: ArrowDown10 },
                { id: "sort-length-asc", label: "Sort by Length (Short to Long)", description: "Sort by line length ascending", icon: ArrowDownAz },
                { id: "sort-length-desc", label: "Sort by Length (Long to Short)", description: "Sort by line length descending", icon: ArrowDownZa },
                { id: "reverse", label: "Reverse Lines", description: "Reverse the order of all lines", icon: ArrowDownZa },
                { id: "shuffle", label: "Shuffle Lines", description: "Randomly shuffle line order", icon: FilterX },
            ],
        },
        {
            title: "Remove & Filter",
            icon: Trash2,
            operations: [
                { id: "remove-duplicates", label: "Remove Duplicate Lines", description: "Keep only unique lines", icon: Eraser },
                { id: "remove-unique", label: "Remove Unique Lines", description: "Keep only duplicate lines", icon: FilterX },
                { id: "remove-blank", label: "Remove Blank Lines", description: "Remove all empty lines", icon: MinusCircle },
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
                { id: "remove-bullets", label: "Remove List Markers", description: "Remove bullets, numbers, checkboxes", icon: MinusCircle },
                { id: "blockquote", label: "Add Blockquote", description: "Prefix lines with '> '", icon: AlignLeft },
                { id: "remove-blockquote", label: "Remove Blockquote", description: "Remove '> ' prefix", icon: MinusCircle },
                { id: "add-code-fence", label: "Wrap in Code Block", description: "Wrap with ``` fences", icon: Hash },
                { id: "increase-heading", label: "Increase Heading Level", description: "Add # to headings", icon: Hash },
                { id: "decrease-heading", label: "Decrease Heading Level", description: "Remove # from headings", icon: Hash },
            ],
        },
        {
            title: "Text Manipulation",
            icon: Type,
            operations: [
                { id: "trim-whitespace", label: "Trim All Whitespace", description: "Trim leading and trailing spaces", icon: Eraser },
                { id: "normalize-whitespace", label: "Normalize Whitespace", description: "Replace multiple spaces with single", icon: Eraser },
                { id: "join-lines", label: "Join Lines", description: "Combine all lines into one", icon: AlignLeft },
                { id: "split-sentences", label: "Split into Sentences", description: "Each sentence on new line", icon: AlignLeft },
                { id: "wrap-quotes", label: "Wrap in Quotes", description: "Wrap each line in quotes", icon: Type },
                { id: "add-line-numbers", label: "Add Line Numbers", description: "Prefix with line numbers", icon: List },
                { id: "indent-lines", label: "Indent Lines", description: "Add 4 spaces to each line", icon: AlignLeft },
                { id: "unindent-lines", label: "Unindent Lines", description: "Remove 4 spaces from each line", icon: AlignLeft },
            ],
        },
    ];

    function handleOperation(operationId: string) {
        editorStore.performTextTransform(operationId);
        onClose();
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-center justify-center" style="background-color: var(--bg-backdrop);" onclick={onClose}>
        <div class="w-[900px] max-h-[85vh] rounded-lg shadow-2xl border overflow-hidden flex flex-col" style="background-color: var(--bg-panel); border-color: var(--border-light);" onclick={(e) => e.stopPropagation()}>
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b" style="border-color: var(--border-light);">
                <div class="flex items-center gap-2">
                    <Type size={20} style="color: var(--accent-secondary);" />
                    <h2 class="text-lg font-semibold" style="color: var(--fg-default);">Text Transformations</h2>
                </div>
                <button type="button" class="p-1 rounded hover:bg-white/10" onclick={onClose} aria-label="Close">
                    <X size={18} style="color: var(--fg-muted);" />
                </button>
            </div>

            <!-- Content -->
            <div class="overflow-y-auto p-4 space-y-6">
                {#each categories as category}
                    {@const CategoryIcon = category.icon}
                    <div>
                        <div class="flex items-center gap-2 mb-3">
                            <CategoryIcon size={16} style="color: var(--accent-primary);" />
                            <h3 class="text-sm font-semibold uppercase tracking-wide" style="color: var(--fg-default);">
                                {category.title}
                            </h3>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            {#each category.operations as operation}
                                {@const OperationIcon = operation.icon}
                                <button type="button" class="flex items-start gap-3 p-3 rounded text-left hover:bg-white/10 transition-colors" style="border: 1px solid var(--border-main);" onclick={() => handleOperation(operation.id)}>
                                    <div class="flex-shrink-0 mt-0.5">
                                        <OperationIcon size={16} style="color: var(--accent-secondary);" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-sm font-medium" style="color: var(--fg-default);">
                                            {operation.label}
                                        </div>
                                        <div class="text-xs mt-0.5" style="color: var(--fg-muted);">
                                            {operation.description}
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>

            <!-- Footer -->
            <div class="p-4 border-t flex justify-between items-center" style="border-color: var(--border-light); background-color: var(--bg-main);">
                <p class="text-xs" style="color: var(--fg-muted);">All operations support undo (Ctrl+Z)</p>
                <button type="button" class="px-4 py-2 rounded text-sm font-medium hover:opacity-80" style="background-color: var(--accent-primary); color: var(--fg-inverse);" onclick={onClose}> Close </button>
            </div>
        </div>
    </div>
{/if}
