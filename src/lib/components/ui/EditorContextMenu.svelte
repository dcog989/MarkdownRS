<script lang="ts">
    import Submenu from "$lib/components/ui/Submenu.svelte";
    import { editorStore, type OperationTypeString } from "$lib/stores/editorStore.svelte.ts";
    import { addToDictionary } from "$lib/utils/fileSystem";
    import { getSuggestions, isWordValid } from "$lib/utils/spellcheck";
    import { ArrowUpDown, BookPlus, BookText, CaseSensitive, ClipboardCopy, ClipboardPaste, Scissors, Sparkles, Wand2, WrapText } from "lucide-svelte";
    import { onDestroy } from "svelte";

    let {
        x = 0,
        y = 0,
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
    let showTransformMenu = $state(false);
    let suggestions = $state<string[]>([]);

    let menuEl = $state<HTMLDivElement>();
    let submenuSide = $state<"left" | "right">("right");
    let resizeObserver: ResizeObserver | null = null;

    $effect(() => {
        if (wordUnderCursor && !selectedText && !isWordValid(wordUnderCursor)) {
            suggestions = getSuggestions(wordUnderCursor);
        } else {
            suggestions = [];
        }
    });

    function updatePosition() {
        if (!menuEl) return;

        const rect = menuEl.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let newX = x;
        let newY = y;

        const BOTTOM_MARGIN = 32;

        if (newX + rect.width > winWidth) {
            newX = winWidth - rect.width - 5;
        }

        if (newY + rect.height > winHeight - BOTTOM_MARGIN) {
            newY = winHeight - rect.height - BOTTOM_MARGIN;
        }

        newX = Math.max(5, newX);
        newY = Math.max(5, newY);

        menuEl.style.left = `${newX}px`;
        menuEl.style.top = `${newY}px`;

        if (newX + rect.width + 200 > winWidth) {
            submenuSide = "left";
        } else {
            submenuSide = "right";
        }

        menuEl.style.visibility = "visible";
    }

    $effect(() => {
        if (menuEl) {
            if (resizeObserver) resizeObserver.disconnect();

            resizeObserver = new ResizeObserver(() => {
                updatePosition();
            });

            resizeObserver.observe(menuEl);
            updatePosition();
        }
    });

    $effect(() => {
        const _ = { x, y, selectedText, suggestions };
        if (menuEl) updatePosition();
    });

    onDestroy(() => {
        if (resizeObserver) resizeObserver.disconnect();
    });

    function handleBackdropContextMenu(e: MouseEvent) {
        e.preventDefault();
        onClose();
    }

    async function handleAddToDictionary() {
        const word = selectedText?.trim() || wordUnderCursor?.trim();
        if (word && word.length > 0) {
            await addToDictionary(word);
            if (onDictionaryUpdate) {
                onDictionaryUpdate();
            }
        }
        onClose();
    }

    async function handleAddAllToDictionary() {
        if (!selectedText) return;
        const words = selectedText.match(/\b[a-zA-Z']+\b/g) || [];
        const uniqueInvalidWords = words.filter((w: string) => !isWordValid(w)).filter((w: string, i: number, arr: string[]) => arr.indexOf(w) === i);

        for (const word of uniqueInvalidWords) {
            await addToDictionary(word);
        }

        if (onDictionaryUpdate) {
            onDictionaryUpdate();
        }
        onClose();
    }

    function handleCut() {
        if (onCut) onCut();
        onClose();
    }

    function handleCopy() {
        if (onCopy) onCopy();
        onClose();
    }

    function handlePaste() {
        if (onPaste) {
            onPaste();
        }
        onClose();
    }

    function handleSuggestionClick(suggestion: string) {
        if (onReplaceWord) {
            onReplaceWord(suggestion);
        }
        onClose();
    }

    const targetWord = $derived(selectedText ? selectedText.trim() : wordUnderCursor?.trim());
    const cleanTarget = $derived(targetWord ? targetWord.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "") : "");
    const canAddSingle = $derived(cleanTarget && cleanTarget.length > 0 && /^[a-zA-Z'-]+$/.test(cleanTarget) && !isWordValid(cleanTarget));

    const canAddMulti = $derived.by(() => {
        if (!selectedText) return false;
        const words = selectedText.match(/\b[a-zA-Z']+\b/g);
        if (!words || words.length < 2) return false;
        return words.some((w: string) => !isWordValid(w));
    });

    const showDictionarySection = $derived(canAddSingle || canAddMulti);
    const hasSelection = $derived(selectedText && selectedText.length > 0);

    function handleTransform(transformType: OperationTypeString) {
        editorStore.performTextTransform(transformType);
        onClose();
    }

    function handleFormatSelection() {
        editorStore.performTextTransform("format-document");
        onClose();
    }

    function handleFormatDocument() {
        editorStore.performTextTransform("format-document");
        onClose();
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50" onclick={onClose} oncontextmenu={handleBackdropContextMenu} role="presentation">
    <div
        bind:this={menuEl}
        class="absolute min-w-[200px] rounded-md shadow-xl border py-1 custom-scrollbar"
        style="
            visibility: hidden;
            top: 0;
            left: 0;
            background-color: var(--bg-panel);
            border-color: var(--border-light);
        "
        onclick={(e) => e.stopPropagation()}
        role="menu"
        tabindex="-1"
    >
        {#if suggestions.length > 0}
            <div class="px-2 py-1 text-ui-sm font-semibold uppercase tracking-wide opacity-50" style="color: var(--fg-muted);">Suggestions</div>
            {#each suggestions as suggestion}
                <button type="button" class="w-full text-left px-4 py-2 text-ui font-medium hover:bg-white/10 flex items-center gap-2" style="color: var(--fg-default);" onclick={() => handleSuggestionClick(suggestion)}>
                    <Sparkles size={14} class="text-[var(--accent-secondary)]" />
                    <span>{suggestion}</span>
                </button>
            {/each}
            <div class="h-px my-1" style="background-color: var(--border-main);"></div>
        {/if}

        {#if selectedText}
            <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleCut}>
                <Scissors size={14} />
                <span>Cut</span>
                <span class="ml-auto text-ui-sm opacity-60">Ctrl+X</span>
            </button>
        {/if}

        {#if selectedText}
            <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleCopy}>
                <ClipboardCopy size={14} />
                <span>Copy</span>
                <span class="ml-auto text-ui-sm opacity-60">Ctrl+C</span>
            </button>
        {/if}

        <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handlePaste}>
            <ClipboardPaste size={14} />
            <span>Paste</span>
            <span class="ml-auto text-ui-sm opacity-60">Ctrl+V</span>
        </button>

        <div class="h-px my-1" style="background-color: var(--border-main);"></div>

        {#if hasSelection}
            <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleFormatSelection}>
                <Wand2 size={14} />
                <span>Format Selection</span>
            </button>
        {/if}

        <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleFormatDocument}>
            <Wand2 size={14} />
            <span>Format Document</span>
            <span class="ml-auto text-ui-sm opacity-60">Shift+Alt+F</span>
        </button>

        {#if hasSelection}
            <div class="h-px my-1" style="background-color: var(--border-main);"></div>

            <!-- Sort Menu -->
            <Submenu
                bind:show={showSortMenu}
                side={submenuSide}
                onOpen={() => {
                    showCaseMenu = false;
                    showTransformMenu = false;
                }}
            >
                {#snippet trigger()}
                    <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);">
                        <ArrowUpDown size={14} />
                        <span>Sort Lines</span>
                        <span class="ml-auto text-ui-sm">▶</span>
                    </button>
                {/snippet}

                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-asc")}>Sort A → Z</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-desc")}>Sort Z → A</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-numeric-asc")}>Sort Numeric ↑</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-numeric-desc")}>Sort Numeric ↓</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-length-asc")}>Sort by Length ↑</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-length-desc")}>Sort by Length ↓</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("reverse")}>Reverse Order</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("shuffle")}>Shuffle</button>
            </Submenu>

            <!-- Case Change Menu -->
            <Submenu
                bind:show={showCaseMenu}
                side={submenuSide}
                onOpen={() => {
                    showSortMenu = false;
                    showTransformMenu = false;
                }}
            >
                {#snippet trigger()}
                    <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);">
                        <CaseSensitive size={14} />
                        <span>Change Case</span>
                        <span class="ml-auto text-ui-sm">▶</span>
                    </button>
                {/snippet}

                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("uppercase")}>UPPERCASE</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("lowercase")}>lowercase</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("title-case")}>Title Case</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sentence-case")}>Sentence case</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("camel-case")}>camelCase</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("pascal-case")}>PascalCase</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("snake-case")}>snake_case</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("kebab-case")}>kebab-case</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("constant-case")}>CONSTANT_CASE</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("invert-case")}>iNVERT cASE</button>
            </Submenu>

            <!-- Transform Menu -->
            <Submenu
                bind:show={showTransformMenu}
                side={submenuSide}
                onOpen={() => {
                    showSortMenu = false;
                    showCaseMenu = false;
                }}
            >
                {#snippet trigger()}
                    <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);">
                        <WrapText size={14} />
                        <span>Transform</span>
                        <span class="ml-auto text-ui-sm">▶</span>
                    </button>
                {/snippet}

                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("remove-duplicates")}>Remove Duplicate Lines</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("remove-blank")}>Remove Blank Lines</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("trim-whitespace")}>Trim Whitespace</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("join-lines")}>Join Lines</button>
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("add-line-numbers")}>Add Line Numbers</button>
            </Submenu>
        {/if}

        {#if showDictionarySection}
            <div class="h-px my-1" style="background-color: var(--border-main);"></div>

            {#if canAddSingle}
                <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleAddToDictionary}>
                    <BookPlus size={14} />
                    <span>Add "{cleanTarget}" to Dictionary</span>
                    <span class="ml-auto text-ui-sm opacity-60">F8</span>
                </button>
            {/if}

            {#if canAddMulti}
                <button type="button" class="w-full text-left px-4 py-2 text-ui flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleAddAllToDictionary}>
                    <BookText size={14} />
                    <span>Add All to Dictionary</span>
                </button>
            {/if}
        {/if}
    </div>
</div>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background-color: var(--border-light);
        border-radius: 3px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
</style>
