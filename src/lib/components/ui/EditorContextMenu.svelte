<script lang="ts">
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import Submenu from "$lib/components/ui/Submenu.svelte";
    import { getOperationsByCategory, type OperationId } from "$lib/config/textOperationsRegistry";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { addToDictionary } from "$lib/utils/fileSystem";
    import { getSuggestions, isWordValid, spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
    import { ArrowUpDown, BookPlus, BookText, CaseSensitive, ClipboardCopy, ClipboardPaste, Rotate3d, Scissors, Sparkles, TextAlignStart, WandSparkles } from "lucide-svelte";
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
    let isLoadingSuggestions = $state(false);

    function closeOtherSubmenus(keepOpen: "sort" | "case" | "format" | "transform" | null = null) {
        if (keepOpen !== "sort") showSortMenu = false;
        if (keepOpen !== "case") showCaseMenu = false;
        if (keepOpen !== "format") showFormatMenu = false;
        if (keepOpen !== "transform") showTransformMenu = false;
    }

    const sortOps = getOperationsByCategory("sort");
    const caseOps = getOperationsByCategory("case");

    type MenuOption = {
        id?: OperationId;
        label?: string;
        divider?: boolean;
    };

    const formatOps: MenuOption[] = [{ id: "indent-lines", label: "Indent Lines" }, { id: "unindent-lines", label: "Unindent Lines" }, { id: "trim-whitespace", label: "Trim Whitespace" }, { id: "normalize-whitespace", label: "Normalize Whitespace" }, { divider: true }, { id: "add-bullets", label: "Add Bullet Points" }, { id: "add-numbers", label: "Add Numbering" }, { id: "add-checkboxes", label: "Add Checkboxes" }, { id: "remove-bullets", label: "Remove List Markers" }, { divider: true }, { id: "blockquote", label: "Add Blockquote" }, { id: "remove-blockquote", label: "Remove Blockquote" }, { id: "add-code-fence", label: "Wrap in Code Block" }, { divider: true }, { id: "increase-heading", label: "Increase Heading Level" }, { id: "decrease-heading", label: "Decrease Heading Level" }, { divider: true }, { id: "wrap-quotes", label: "Wrap in Quotes" }];

    const transformOps: MenuOption[] = [{ id: "join-lines", label: "Join Lines" }, { id: "split-sentences", label: "Sentences to New Lines" }, { divider: true }, { id: "remove-duplicates", label: "Remove Duplicates" }, { id: "remove-unique", label: "Remove Unique" }, { divider: true }, { id: "remove-blank", label: "Remove Blank Lines" }, { id: "remove-all-spaces", label: "Remove All Spaces" }, { divider: true }, { id: "reverse", label: "Reverse Lines" }, { id: "shuffle", label: "Shuffle Lines" }];

    $effect(() => {
        const word = untrack(() => wordUnderCursor?.trim());

        if (spellcheckState.dictionaryLoaded && word && !selectedText && !isWordValid(word)) {
            isLoadingSuggestions = true;
            getSuggestions(word)
                .then((res) => {
                    suggestions = res.slice(0, 5);
                })
                .catch(() => {
                    suggestions = [];
                })
                .finally(() => {
                    isLoadingSuggestions = false;
                });
        } else {
            suggestions = [];
            isLoadingSuggestions = false;
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

    function handleOp(type: OperationId | undefined) {
        if (type) {
            appContext.editor.performTextTransform(type);
            onClose();
        }
    }

    function closeMenuAndReset() {
        onClose();
        isLoadingSuggestions = false;
        suggestions = [];
    }
</script>

<ContextMenu {x} {y} onClose={closeMenuAndReset}>
    {#snippet children({ submenuSide })}
        {#if suggestions.length > 0 || isLoadingSuggestions}
            <div class="px-3 py-1 text-ui-sm font-bold uppercase opacity-50 text-fg-muted">Suggestions</div>
            {#if isLoadingSuggestions}
                <div class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 opacity-70">
                    <Sparkles size={14} class="text-accent-secondary animate-spin" /><span>Loading suggestions...</span>
                </div>
            {:else}
                {#each suggestions as s}
                    <button class="w-full text-left px-3 py-1.5 text-ui font-medium hover:bg-white/10 flex items-center gap-2" onclick={() => onReplaceWord?.(s)}>
                        <Sparkles size={14} class="text-accent-secondary" /><span>{s}</span>
                    </button>
                {/each}
            {/if}
            <div class="h-px my-1 bg-border-main"></div>
        {/if}

        <div onmouseenter={() => closeOtherSubmenus(null)} role="none">
            {#if selectedText}
                <button
                    class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10"
                    onclick={() => {
                        onCut?.();
                        closeMenuAndReset();
                    }}
                >
                    <Scissors size={14} /><span>Cut</span><span class="ml-auto text-ui-sm opacity-50">Ctrl+X</span>
                </button>
                <button
                    class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10"
                    onclick={() => {
                        onCopy?.();
                        closeMenuAndReset();
                    }}
                >
                    <ClipboardCopy size={14} /><span>Copy</span><span class="ml-auto text-ui-sm opacity-50">Ctrl+C</span>
                </button>
            {/if}
            <button
                class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10"
                onclick={() => {
                    onPaste?.();
                    closeMenuAndReset();
                }}
            >
                <ClipboardPaste size={14} /><span>Paste</span><span class="ml-auto text-ui-sm opacity-50">Ctrl+V</span>
            </button>

            <div class="h-px my-1 bg-border-main"></div>

            <button class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10" onclick={() => handleOp("format-document")}>
                <WandSparkles size={14} /><span>{selectedText ? "Format Selection" : "Format Document"}</span><span class="ml-auto text-ui-sm opacity-50">Alt+Shift+F</span>
            </button>
        </div>

        {#if selectedText}
            <div class="h-px my-1 bg-border-main"></div>

            <!-- Sort Menu -->
            <Submenu bind:show={showSortMenu} side={submenuSide} onOpen={() => closeOtherSubmenus("sort")}>
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
            <Submenu bind:show={showCaseMenu} side={submenuSide} onOpen={() => closeOtherSubmenus("case")}>
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
            <Submenu bind:show={showFormatMenu} side={submenuSide} onOpen={() => closeOtherSubmenus("format")}>
                {#snippet trigger()}
                    <button class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10">
                        <TextAlignStart size={14} /><span>Format Lines</span><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each formatOps as op}
                    {#if op.divider}
                        <div class="h-px my-1 bg-border-main"></div>
                    {:else}
                        <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleOp(op.id)}>{op.label}</button>
                    {/if}
                {/each}
            </Submenu>

            <!-- Transform Menu -->
            <Submenu bind:show={showTransformMenu} side={submenuSide} onOpen={() => closeOtherSubmenus("transform")}>
                {#snippet trigger()}
                    <button class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10">
                        <Rotate3d size={14} /><span>Transform Lines</span><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each transformOps as op}
                    {#if op.divider}
                        <div class="h-px my-1 bg-border-main"></div>
                    {:else}
                        <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleOp(op.id)}>{op.label}</button>
                    {/if}
                {/each}
            </Submenu>
        {/if}

        <div onmouseenter={() => closeOtherSubmenus(null)} role="none">
            {#if canAddSingle || (selectedText && selectedText.split(/\s+/).length > 1)}
                <div class="h-px my-1 bg-border-main"></div>
                {#if canAddSingle}
                    <button
                        class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10"
                        onclick={async () => {
                            await addToDictionary(targetWord);
                            onDictionaryUpdate?.();
                            closeMenuAndReset();
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
        </div>
    {/snippet}
</ContextMenu>

<style>
    button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
    }
</style>
