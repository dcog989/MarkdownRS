<script lang="ts">
    import { editorStore, type OperationTypeString } from "$lib/stores/editorStore.svelte.ts";
    import { addToDictionary } from "$lib/utils/fileSystem";
    import { ArrowUpDown, BookPlus, BookText, CaseSensitive, ClipboardCopy, ClipboardPaste, Scissors, WrapText } from "lucide-svelte";
    import { onDestroy } from "svelte";

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

    let menuEl = $state<HTMLDivElement>();
    let submenuSide = $state<"left" | "right">("right");
    let resizeObserver: ResizeObserver | null = null;

    function updatePosition() {
        if (!menuEl) return;

        const rect = menuEl.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let newX = x;
        let newY = y;

        // Account for status bar (h-6 = 24px) + padding
        const BOTTOM_MARGIN = 32;

        // 1. Horizontal constraint
        if (newX + rect.width > winWidth) {
            newX = winWidth - rect.width - 5;
        }

        // 2. Vertical constraint
        if (newY + rect.height > winHeight - BOTTOM_MARGIN) {
            newY = winHeight - rect.height - BOTTOM_MARGIN;
        }

        // 3. Top/Left safety guard
        newX = Math.max(5, newX);
        newY = Math.max(5, newY);

        // Apply
        menuEl.style.left = `${newX}px`;
        menuEl.style.top = `${newY}px`;

        // Determine submenu direction based on available space
        if (newX + rect.width + 200 > winWidth) {
            submenuSide = "left";
        } else {
            submenuSide = "right";
        }

        // Reveal
        menuEl.style.visibility = "visible";
    }

    $effect(() => {
        if (menuEl) {
            // Setup ResizeObserver to handle content loading/size changes
            if (resizeObserver) resizeObserver.disconnect();

            resizeObserver = new ResizeObserver(() => {
                updatePosition();
            });

            resizeObserver.observe(menuEl);

            // Initial position update
            updatePosition();
        }
    });

    // React to prop changes (x/y updates)
    $effect(() => {
        const _ = { x, y, selectedText }; // Dependency tracking
        // Force update if menu exists
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
        const words = selectedText
            .split(/\s+/)
            .map((w: string) => w.replace(/[^a-zA-Z0-9'-]/g, ""))
            .filter((w: string) => w.length > 0)
            .filter((word: string, index: number, self: string[]) => self.indexOf(word) === index);

        for (const word of words) {
            await addToDictionary(word);
        }

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

    const hasWord = $derived((selectedText?.trim() || wordUnderCursor?.trim())?.length > 0);
    const hasMultipleWords = $derived(selectedText && selectedText.trim().split(/\s+/).length > 1);
    const hasSelection = $derived(selectedText && selectedText.length > 0);

    const canAddToDictionary = $derived(hasWord && /^[a-zA-Z'-]+$/.test(selectedText?.trim() || wordUnderCursor?.trim() || ""));
    const canAddMultipleToDictionary = $derived(hasMultipleWords && selectedText.split(/\s+/).some((w: string) => /^[a-zA-Z'-]+$/.test(w.replace(/[^a-zA-Z0-9'-]/g, ""))));

    function handleTransform(transformType: OperationTypeString) {
        editorStore.performTextTransform(transformType);
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
            visibility: hidden; /* Start hidden for measurement */
            top: 0;
            left: 0;
            background-color: var(--bg-panel);
            border-color: var(--border-light);
            max-height: calc(100vh - 40px); /* Ensure it fits with margins */
            overflow-y: auto;
        "
        onclick={(e) => e.stopPropagation()}
        role="menu"
        tabindex="-1"
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
