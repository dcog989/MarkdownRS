<script lang="ts">
    import { editorStore, type OperationTypeString } from "$lib/stores/editorStore.svelte.ts";
    import { addToDictionary } from "$lib/utils/fileSystem";
    import { ArrowUpDown, BookPlus, BookText, CaseSensitive, ClipboardCopy, ClipboardPaste, Scissors, WrapText } from "lucide-svelte";
    import { untrack } from "svelte";

    let {
        x = 0,
        y = 0,
        selectedText = "",
        wordUnderCursor = "",
        onClose,
        onDictionaryUpdate,
    } = $props<{
        x: number;
        y: number;
        selectedText?: string;
        wordUnderCursor?: string;
        onClose: () => void;
        onDictionaryUpdate?: () => void;
    }>();

    // Submenu state
    let showSortMenu = $state(false);
    let showCaseMenu = $state(false);
    let showTransformMenu = $state(false);

    // Position state
    let menuEl = $state<HTMLDivElement>();
    let adjustedX = $state(untrack(() => x));
    let adjustedY = $state(untrack(() => y));
    let submenuSide = $state<"left" | "right">("right");

    $effect(() => {
        if (menuEl && (x || y)) {
            const rect = menuEl.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let newX = x;
            let newY = y;

            // Prevent overflowing right edge
            if (newX + rect.width > winWidth) {
                newX = winWidth - rect.width - 5;
            }
            // Prevent overflowing bottom edge
            if (newY + rect.height > winHeight) {
                newY = winHeight - rect.height - 5;
            }

            adjustedX = newX;
            adjustedY = newY;

            // Determine if submenu should open to the left
            // Check if there is space on the right for submenus (approx 200px)
            if (newX + rect.width + 200 > winWidth) {
                submenuSide = "left";
            } else {
                submenuSide = "right";
            }
        }
    });

    async function handleAddToDictionary() {
        const word = selectedText?.trim() || wordUnderCursor?.trim();
        if (word && word.length > 0) {
            await addToDictionary(word);
            // Trigger spellcheck refresh
            if (onDictionaryUpdate) {
                onDictionaryUpdate();
            }
        }
        onClose();
    }

    async function handleAddAllToDictionary() {
        if (!selectedText) return;

        // Extract unique words from selected text
        const words = selectedText
            .split(/\s+/)
            .map((w: string) => w.replace(/[^a-zA-Z0-9'-]/g, "")) // Remove punctuation except apostrophes and hyphens
            .filter((w: string) => w.length > 0)
            .filter((word: string, index: number, self: string[]) => self.indexOf(word) === index); // Unique words

        // Add all words to dictionary
        for (const word of words) {
            await addToDictionary(word);
        }

        // Trigger spellcheck refresh
        if (onDictionaryUpdate) {
            onDictionaryUpdate();
        }

        onClose();
    }

    function handleCut() {
        document.execCommand("cut");
        onClose();
    }

    function handleCopy() {
        document.execCommand("copy");
        onClose();
    }

    function handlePaste() {
        document.execCommand("paste");
        onClose();
    }

    // Helper to check if text contains misspelled words
    function hasMisspelledWords(text: string): boolean {
        if (!text || text.trim().length === 0) return false;

        // Create temporary element to check spelling
        const temp = document.createElement("div");
        temp.setAttribute("contenteditable", "true");
        temp.setAttribute("spellcheck", "true");
        temp.style.position = "absolute";
        temp.style.left = "-9999px";
        temp.textContent = text;
        document.body.appendChild(temp);

        // Force spell check by focusing
        temp.focus();

        // Check for misspellings
        const range = document.createRange();
        range.selectNodeContents(temp);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        // Simple heuristic: check if browser would mark it as misspelled
        // We rely on the word being in the editor with spell check enabled
        const hasMisspelling = text.length > 0 && /^[a-zA-Z'-]+$/.test(text.trim());

        document.body.removeChild(temp);
        return hasMisspelling;
    }

    const hasWord = $derived((selectedText?.trim() || wordUnderCursor?.trim())?.length > 0);
    const hasMultipleWords = $derived(selectedText && selectedText.trim().split(/\s+/).length > 1);
    const hasSelection = $derived(selectedText && selectedText.length > 0);

    // Only show dictionary options if there's a valid word/selection with potential misspellings
    const canAddToDictionary = $derived(hasWord && /^[a-zA-Z'-]+$/.test(selectedText?.trim() || wordUnderCursor?.trim() || ""));
    const canAddMultipleToDictionary = $derived(hasMultipleWords && selectedText.split(/\s+/).some((w: string) => /^[a-zA-Z'-]+$/.test(w.replace(/[^a-zA-Z0-9'-]/g, ""))));

    function handleTransform(transformType: OperationTypeString) {
        editorStore.performTextTransform(transformType);
        onClose();
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50" onclick={onClose}>
    <div
        bind:this={menuEl}
        class="absolute min-w-[200px] rounded-md shadow-xl border py-1"
        style="
            left: {adjustedX}px;
            top: {adjustedY}px;
            background-color: var(--bg-panel);
            border-color: var(--border-light);
        "
        onclick={(e) => e.stopPropagation()}
    >
        {#if selectedText}
            <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleCut}>
                <Scissors size={14} />
                <span>Cut</span>
                <span class="ml-auto text-xs opacity-60">Ctrl+X</span>
            </button>
        {/if}

        {#if selectedText}
            <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleCopy}>
                <ClipboardCopy size={14} />
                <span>Copy</span>
                <span class="ml-auto text-xs opacity-60">Ctrl+C</span>
            </button>
        {/if}

        <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handlePaste}>
            <ClipboardPaste size={14} />
            <span>Paste</span>
            <span class="ml-auto text-xs opacity-60">Ctrl+V</span>
        </button>

        {#if hasSelection}
            <div class="h-px my-1" style="background-color: var(--border-main);"></div>

            <!-- Sort Menu -->
            <div class="relative">
                <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onmouseenter={() => (showSortMenu = true)} onmouseleave={() => (showSortMenu = false)}>
                    <ArrowUpDown size={14} />
                    <span>Sort Lines</span>
                    <span class="ml-auto text-xs">▶</span>
                </button>

                {#if showSortMenu}
                    <div
                        class="absolute top-0 min-w-[180px] rounded-md shadow-xl border py-1 z-50"
                        style="
                            background-color: var(--bg-panel);
                            border-color: var(--border-light);
                            {submenuSide === 'left' ? 'right: 100%; margin-right: 0.25rem;' : 'left: 100%; margin-left: 0.25rem;'}
                        "
                        onmouseenter={() => (showSortMenu = true)}
                        onmouseleave={() => (showSortMenu = false)}
                    >
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-asc")}>Sort A → Z</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-desc")}>Sort Z → A</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-numeric-asc")}>Sort Numeric ↑</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-numeric-desc")}>Sort Numeric ↓</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-length-asc")}>Sort by Length ↑</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sort-length-desc")}>Sort by Length ↓</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("reverse")}>Reverse Order</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("shuffle")}>Shuffle</button>
                    </div>
                {/if}
            </div>

            <!-- Case Change Menu -->
            <div class="relative">
                <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onmouseenter={() => (showCaseMenu = true)} onmouseleave={() => (showCaseMenu = false)}>
                    <CaseSensitive size={14} />
                    <span>Change Case</span>
                    <span class="ml-auto text-xs">▶</span>
                </button>

                {#if showCaseMenu}
                    <div
                        class="absolute top-0 min-w-[180px] rounded-md shadow-xl border py-1 z-50"
                        style="
                            background-color: var(--bg-panel);
                            border-color: var(--border-light);
                            {submenuSide === 'left' ? 'right: 100%; margin-right: 0.25rem;' : 'left: 100%; margin-left: 0.25rem;'}
                        "
                        onmouseenter={() => (showCaseMenu = true)}
                        onmouseleave={() => (showCaseMenu = false)}
                    >
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("uppercase")}>UPPERCASE</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("lowercase")}>lowercase</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("title-case")}>Title Case</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("sentence-case")}>Sentence case</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("camel-case")}>camelCase</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("pascal-case")}>PascalCase</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("snake-case")}>snake_case</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("kebab-case")}>kebab-case</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("constant-case")}>CONSTANT_CASE</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("invert-case")}>iNVERT cASE</button>
                    </div>
                {/if}
            </div>

            <!-- Transform Menu -->
            <div class="relative">
                <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onmouseenter={() => (showTransformMenu = true)} onmouseleave={() => (showTransformMenu = false)}>
                    <WrapText size={14} />
                    <span>Transform</span>
                    <span class="ml-auto text-xs">▶</span>
                </button>

                {#if showTransformMenu}
                    <div
                        class="absolute top-0 min-w-[200px] rounded-md shadow-xl border py-1 z-50"
                        style="
                            background-color: var(--bg-panel);
                            border-color: var(--border-light);
                            {submenuSide === 'left' ? 'right: 100%; margin-right: 0.25rem;' : 'left: 100%; margin-left: 0.25rem;'}
                        "
                        onmouseenter={() => (showTransformMenu = true)}
                        onmouseleave={() => (showTransformMenu = false)}
                    >
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("remove-duplicates")}>Remove Duplicate Lines</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("remove-blank")}>Remove Blank Lines</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("trim-whitespace")}>Trim Whitespace</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("join-lines")}>Join Lines</button>
                        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={() => handleTransform("add-line-numbers")}>Add Line Numbers</button>
                    </div>
                {/if}
            </div>
        {/if}

        {#if canAddToDictionary}
            <div class="h-px my-1" style="background-color: var(--border-main);"></div>

            <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleAddToDictionary}>
                <BookPlus size={14} />
                <span>Add to Dictionary</span>
                <span class="ml-auto text-xs opacity-60">F8</span>
            </button>

            {#if canAddMultipleToDictionary}
                <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleAddAllToDictionary}>
                    <BookText size={14} />
                    <span>Add All to Dictionary</span>
                </button>
            {/if}
        {/if}
    </div>
</div>
