<script lang="ts">
    import { editorStore, type OperationTypeString } from "$lib/stores/editorStore.svelte.ts";
    import { addToDictionary } from "$lib/utils/fileSystem";
    import { isWordValid } from "$lib/utils/spellcheck";
    import { ArrowUpDown, BookPlus, BookText, CaseSensitive, ClipboardCopy, ClipboardPaste, Scissors, WrapText } from "lucide-svelte";
    import { onDestroy } from "svelte";

    let {
        x = 0,
        y = 0,
        selectedText = "",
        wordUnderCursor = "",
        onClose,
        onDictionaryUpdate,
        onPaste,
    } = $props<{
        x: number;
        y: number;
        selectedText?: string;
        wordUnderCursor?: string;
        onClose: () => void;
        onDictionaryUpdate?: () => void;
        onPaste?: () => void;
    }>();

    // Submenu state
    let showSortMenu = $state(false);
    let showCaseMenu = $state(false);
    let showTransformMenu = $state(false);

    // Timers for hover grace periods
    let sortTimer: number | null = null;
    let caseTimer: number | null = null;
    let transformTimer: number | null = null;

    let menuEl = $state<HTMLDivElement>();
    let submenuSide = $state<"left" | "right">("right");
    let resizeObserver: ResizeObserver | null = null;

    function openSubmenu(menu: "sort" | "case" | "transform") {
        if (menu === "sort" && sortTimer) clearTimeout(sortTimer);
        if (menu === "case" && caseTimer) clearTimeout(caseTimer);
        if (menu === "transform" && transformTimer) clearTimeout(transformTimer);

        if (menu === "sort") {
            showSortMenu = true;
            showCaseMenu = false;
            showTransformMenu = false;
        } else if (menu === "case") {
            showCaseMenu = true;
            showSortMenu = false;
            showTransformMenu = false;
        } else if (menu === "transform") {
            showTransformMenu = true;
            showSortMenu = false;
            showCaseMenu = false;
        }
    }

    function closeSubmenu(menu: "sort" | "case" | "transform") {
        const delay = 200;
        if (menu === "sort") {
            sortTimer = window.setTimeout(() => (showSortMenu = false), delay);
        } else if (menu === "case") {
            caseTimer = window.setTimeout(() => (showCaseMenu = false), delay);
        } else if (menu === "transform") {
            transformTimer = window.setTimeout(() => (showTransformMenu = false), delay);
        }
    }

    function updatePosition() {
        if (!menuEl) return;

        const rect = menuEl.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let newX = x;
        let newY = y;

        const BOTTOM_MARGIN = 32;

        // 1. Horizontal constraint
        if (newX + rect.width > winWidth) {
            newX = winWidth - rect.width - 5;
        }

        // 2. Vertical constraint (Shift up if hitting bottom)
        if (newY + rect.height > winHeight - BOTTOM_MARGIN) {
            newY = winHeight - rect.height - BOTTOM_MARGIN;
        }

        // 3. Top/Left safety guard
        newX = Math.max(5, newX);
        newY = Math.max(5, newY);

        // Apply
        menuEl.style.left = `${newX}px`;
        menuEl.style.top = `${newY}px`;

        // Determine submenu direction
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
            if (resizeObserver) resizeObserver.disconnect();

            resizeObserver = new ResizeObserver(() => {
                updatePosition();
            });

            resizeObserver.observe(menuEl);
            updatePosition();
        }
    });

    $effect(() => {
        const _ = { x, y, selectedText };
        if (menuEl) updatePosition();
    });

    onDestroy(() => {
        if (resizeObserver) resizeObserver.disconnect();
        if (sortTimer) clearTimeout(sortTimer);
        if (caseTimer) clearTimeout(caseTimer);
        if (transformTimer) clearTimeout(transformTimer);
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

        // Extract words using standard linter regex to ensure clean words
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
        document.execCommand("cut");
        onClose();
    }

    function handleCopy() {
        document.execCommand("copy");
        onClose();
    }

    function handlePaste() {
        if (onPaste) {
            onPaste();
        }
        onClose();
    }

    const targetWord = $derived(selectedText ? selectedText.trim() : wordUnderCursor?.trim());

    // Clean target word for single-word validity check
    // Remove leading/trailing non-alpha chars (punctuation)
    const cleanTarget = $derived(targetWord ? targetWord.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "") : "");

    // 1. Single Word Add: Valid format AND not in dictionary
    const canAddSingle = $derived(cleanTarget && cleanTarget.length > 0 && /^[a-zA-Z'-]+$/.test(cleanTarget) && !isWordValid(cleanTarget));

    // 2. Multi Word Add: Selection contains extracted words, >1 word, and at least one is invalid
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
                <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onmouseenter={() => openSubmenu("sort")} onmouseleave={() => closeSubmenu("sort")}>
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
                        onmouseenter={() => openSubmenu("sort")}
                        onmouseleave={() => closeSubmenu("sort")}
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
                <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onmouseenter={() => openSubmenu("case")} onmouseleave={() => closeSubmenu("case")}>
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
                        onmouseenter={() => openSubmenu("case")}
                        onmouseleave={() => closeSubmenu("case")}
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
                <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onmouseenter={() => openSubmenu("transform")} onmouseleave={() => closeSubmenu("transform")}>
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
                        onmouseenter={() => openSubmenu("transform")}
                        onmouseleave={() => closeSubmenu("transform")}
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

        {#if showDictionarySection}
            <div class="h-px my-1" style="background-color: var(--border-main);"></div>

            {#if canAddSingle}
                <button type="button" class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10" style="color: var(--fg-default);" onclick={handleAddToDictionary}>
                    <BookPlus size={14} />
                    <span>Add to Dictionary</span>
                    <span class="ml-auto text-xs opacity-60">F8</span>
                </button>
            {/if}

            {#if canAddMulti}
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
