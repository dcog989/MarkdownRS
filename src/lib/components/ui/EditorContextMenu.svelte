<script lang="ts">
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import Submenu from "$lib/components/ui/Submenu.svelte";
    import { getOperationsByCategory } from "$lib/config/textOperations";
    import { editorStore, type OperationTypeString } from "$lib/stores/editorStore.svelte.ts";
    import { addToDictionary } from "$lib/utils/fileSystem";
    import { getSuggestions, isWordValid, spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
    import { AlignLeft, ArrowUpDown, BookPlus, BookText, CaseSensitive, ClipboardCopy, ClipboardPaste, Rotate3d, Scissors, Sparkles, WandSparkles } from "lucide-svelte";
    import { untrack } from "svelte";

    let {
        x,
        y,
        selectedText = "",
        wordUnderCursor = "",
        onClose,
        onDictionaryUpdate,
        onCut,
        onCopy,
        onPaste,
        onReplaceWord,
    } = $props<{
        x: number;
        y: number;
        selectedText?: string;
        wordUnderCursor?: string;
        onClose: () => void;
        onDictionaryUpdate?: () => void;
        onCut?: () => void;
        onCopy?: () => void;
        onPaste?: () => void;
        onReplaceWord?: (newWord: string) => void;
    }>();

    let showSortMenu = $state(false);
    let showCaseMenu = $state(false);
    let showFormatMenu = $state(false);
    let showTransformMenu = $state(false);
    let suggestions = $state<string[]>([]);

    // Operations
    const sortOps = getOperationsByCategory("Sort & Order");
    const caseOps = getOperationsByCategory("Case Transformations");

    type MenuOption = {
        id?: OperationTypeString;
        label?: string;
        divider?: boolean;
    };

    // Organized Format Menu (Non-destructive/Styling)
    const formatOps: MenuOption[] = [
        // Indentation & Spacing
        { id: "indent-lines", label: "Indent Lines" },
        { id: "unindent-lines", label: "Unindent Lines" },
        { id: "trim-whitespace", label: "Trim Whitespace" },
        { id: "normalize-whitespace", label: "Normalize Whitespace" },
        { divider: true },
        // Lists
        { id: "add-bullets", label: "Add Bullet Points" },
        { id: "add-numbers", label: "Add Numbering" },
        { id: "add-checkboxes", label: "Add Checkboxes" },
        { id: "remove-bullets", label: "Remove List Markers" },
        { divider: true },
        // Block Elements
        { id: "blockquote", label: "Add Blockquote" },
        { id: "remove-blockquote", label: "Remove Blockquote" },
        { id: "add-code-fence", label: "Wrap in Code Block" },
        { divider: true },
        // Headings
        { id: "increase-heading", label: "Increase Heading Level" },
        { id: "decrease-heading", label: "Decrease Heading Level" },
        { divider: true },
        // Misc
        { id: "wrap-quotes", label: "Wrap in Quotes" },
    ];

    // Transform Menu (Destructive/Structural)
    const transformOps: MenuOption[] = [{ id: "join-lines", label: "Join Lines" }, { id: "split-sentences", label: "Sentences to New Lines" }, { divider: true }, { id: "remove-duplicates", label: "Remove Duplicates" }, { id: "remove-unique", label: "Remove Unique" }, { divider: true }, { id: "remove-blank", label: "Remove Blank Lines" }, { id: "remove-all-spaces", label: "Remove All Spaces" }, { divider: true }, { id: "reverse", label: "Reverse Lines" }, { id: "shuffle", label: "Shuffle Lines" }];

    $effect(() => {
        const word = untrack(() => wordUnderCursor?.trim());
        if (spellcheckState.dictionaryLoaded && word && !selectedText) {
            getSuggestions(word).then((res) => (suggestions = res.slice(0, 5)));
        } else {
            suggestions = [];
        }
    });

    const targetWord = $derived((((selectedText || wordUnderCursor) as string) || "").trim().replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, ""));
    const canAddSingle = $derived(targetWord.length > 1 && !/[a-z][A-Z]/.test(targetWord) && !isWordValid(targetWord));

    async function handleAddAll() {
        const matches = (selectedText as string).match(/\b[a-zA-Z']+\b/g) || [];
        const uniqueWords: string[] = Array.from(new Set(matches));
        const invalidWords = uniqueWords.filter((w: string) => !isWordValid(w));
        for (const word of invalidWords) await addToDictionary(word);
        onDictionaryUpdate?.();
        onClose();
    }

    function handleOp(type: OperationTypeString | undefined) {
        if (type) {
            editorStore.performTextTransform(type);
            onClose();
        }
    }
</script>

<ContextMenu {x} {y} {onClose}>
    {#snippet children({ submenuSide })}
        {#if suggestions.length > 0}
            <div class="px-3 py-1 text-ui-sm font-bold uppercase opacity-50 text-[var(--color-fg-muted)]">Suggestions</div>
            {#each suggestions as s}
                <button class="w-full text-left px-3 py-1.5 text-ui font-medium hover:bg-white/10 flex items-center gap-2" onclick={() => onReplaceWord?.(s)}>
                    <Sparkles size={14} class="text-[var(--color-accent-secondary)]" /><span>{s}</span>
                </button>
            {/each}
            <div class="h-px my-1 bg-[var(--color-border-main)]"></div>
        {/if}

        {#if selectedText}
            <button
                class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10"
                onclick={() => {
                    onCut?.();
                    onClose();
                }}
            >
                <Scissors size={14} /><span>Cut</span><span class="ml-auto text-ui-sm opacity-50">Ctrl+X</span>
            </button>
            <button
                class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10"
                onclick={() => {
                    onCopy?.();
                    onClose();
                }}
            >
                <ClipboardCopy size={14} /><span>Copy</span><span class="ml-auto text-ui-sm opacity-50">Ctrl+C</span>
            </button>
        {/if}
        <button
            class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10"
            onclick={() => {
                onPaste?.();
                onClose();
            }}
        >
            <ClipboardPaste size={14} /><span>Paste</span><span class="ml-auto text-ui-sm opacity-50">Ctrl+V</span>
        </button>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <button class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10" onclick={() => handleOp("format-document")}>
            <WandSparkles size={14} /><span>{selectedText ? "Format Selection" : "Format Document"}</span><span class="ml-auto text-ui-sm opacity-50">Alt+Shift+F</span>
        </button>

        {#if selectedText}
            <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

            <!-- Sort Menu -->
            <Submenu bind:show={showSortMenu} side={submenuSide}>
                {#snippet trigger()}
                    <button class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10">
                        <ArrowUpDown size={14} /><span>Sort Lines</span><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each sortOps as op}
                    <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleOp(op.id)}>{op.label}</button>
                {/each}
            </Submenu>

            <!-- Case Menu -->
            <Submenu bind:show={showCaseMenu} side={submenuSide}>
                {#snippet trigger()}
                    <button class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10">
                        <CaseSensitive size={14} /><span>Change Case</span><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each caseOps as op}
                    <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleOp(op.id)}>{op.label}</button>
                {/each}
            </Submenu>

            <!-- Format Menu -->
            <Submenu bind:show={showFormatMenu} side={submenuSide}>
                {#snippet trigger()}
                    <button class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10">
                        <AlignLeft size={14} /><span>Format Lines</span><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each formatOps as op}
                    {#if op.divider}
                        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>
                    {:else}
                        <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleOp(op.id)}>{op.label}</button>
                    {/if}
                {/each}
            </Submenu>

            <!-- Transform Menu -->
            <Submenu bind:show={showTransformMenu} side={submenuSide}>
                {#snippet trigger()}
                    <button class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10">
                        <Rotate3d size={14} /><span>Transform Lines</span><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each transformOps as op}
                    {#if op.divider}
                        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>
                    {:else}
                        <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleOp(op.id)}>{op.label}</button>
                    {/if}
                {/each}
            </Submenu>
        {/if}

        {#if canAddSingle || (selectedText && selectedText.split(/\s+/).length > 1)}
            <div class="h-px my-1 bg-[var(--color-border-main)]"></div>
            {#if canAddSingle}
                <button
                    class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10"
                    onclick={async () => {
                        await addToDictionary(targetWord);
                        onDictionaryUpdate?.();
                        onClose();
                    }}
                >
                    <BookPlus size={14} /><span class="truncate">Add "{targetWord}" to Dictionary</span><span class="ml-auto text-ui-sm opacity-50">F8</span>
                </button>
            {/if}
            {#if selectedText && selectedText.split(/\s+/).length > 1}
                <button class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10" onclick={handleAddAll}>
                    <BookText size={14} /><span>Add All Invalid to Dictionary</span>
                </button>
            {/if}
        {/if}
    {/snippet}
</ContextMenu>
