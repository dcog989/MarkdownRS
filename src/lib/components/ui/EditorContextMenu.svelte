<script lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener';
import {
    ArrowUpDown,
    BookPlus,
    BookText,
    CaseSensitive,
    ClipboardCopy,
    ClipboardPaste,
    List,
    Rotate3d,
    Scissors,
    Search,
    Sparkles,
    TextAlignStart,
    WandSparkles,
} from 'lucide-svelte';
import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
import Submenu from '$lib/components/ui/Submenu.svelte';
import type { OperationId } from '$lib/config/textOperationsRegistry';
import { addToDictionary } from '$lib/services/dictionaryService';
import { performTextTransform } from '$lib/stores/editorStore.svelte';
import { spellcheckState } from '$lib/utils/spellcheck.svelte.ts';

let {
    x,
    y,
    selectedText = '',
    wordUnderCursor = '',
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

let activeSubmenu = $state<'sort' | 'case' | 'format' | 'transform' | null>(null);
let suggestions = $state<string[]>([]);
let isLoadingSuggestions = $state(false);

type MenuOption = {
    id?: OperationId;
    label?: string;
    divider?: boolean;
};

const sortOps: MenuOption[] = [
    { id: 'sort-asc', label: 'Ascending (A-Z)' },
    { id: 'sort-case-insensitive-asc', label: 'Ascending (Ignore Case)' },
    { id: 'sort-numeric-asc', label: 'Ascending (Numeric)' },
    { id: 'sort-length-asc', label: 'Ascending (By Length)' },
    { divider: true },
    { id: 'sort-desc', label: 'Descending (Z-A)' },
    { id: 'sort-case-insensitive-desc', label: 'Descending (Ignore Case)' },
    { id: 'sort-numeric-desc', label: 'Descending (Numeric)' },
    { id: 'sort-length-desc', label: 'Descending (By Length)' },
    { divider: true },
    { id: 'reverse', label: 'Reverse' },
    { id: 'shuffle', label: 'Shuffle' },
];

const caseOps: MenuOption[] = [
    { id: 'uppercase', label: 'UPPERCASE' },
    { id: 'lowercase', label: 'lowercase' },
    { divider: true },
    { id: 'upper-case-first', label: 'Upper case first' },
    { id: 'lower-case-first', label: 'lower case first' },
    { divider: true },
    { id: 'title-case', label: 'Title Case' },
    { id: 'sentence-case', label: 'Sentence case' },
    { id: 'capital-case', label: 'Capital Case' },
    { id: 'no-case', label: 'no case' },
    { divider: true },
    { id: 'camel-case', label: 'camelCase' },
    { id: 'pascal-case', label: 'PascalCase' },
    { id: 'snake-case', label: 'snake_case' },
    { id: 'kebab-case', label: 'kebab-case' },
    { id: 'constant-case', label: 'CONSTANT_CASE' },
    { id: 'dot-case', label: 'dot.case' },
    { id: 'path-case', label: 'path/case' },
    { id: 'header-case', label: 'Header-Case' },
    { divider: true },
    { id: 'swap-case', label: 'sWAP cASE' },
];

const formatOps: MenuOption[] = [
    { id: 'indent-lines', label: 'Indent Lines' },
    { id: 'unindent-lines', label: 'Unindent Lines' },
    { id: 'trim-whitespace', label: 'Trim Whitespace' },
    { id: 'normalize-whitespace', label: 'Normalize Whitespace' },
    { divider: true },
    { id: 'toggle-bullets', label: 'Bullet Points' },
    { id: 'add-numbers', label: 'Add Numbering' },
    { id: 'add-checkboxes', label: 'Add Checkboxes' },
    { divider: true },
    { id: 'toggle-blockquote', label: 'Blockquote' },
    { id: 'toggle-code-fence', label: 'Code Block' },
    { divider: true },
    { id: 'increase-heading', label: 'Increase Heading Level' },
    { id: 'decrease-heading', label: 'Decrease Heading Level' },
    { divider: true },
    { id: 'wrap-quotes', label: 'Wrap in Quotes' },
];

const transformOps: MenuOption[] = [
    { id: 'join-lines', label: 'Join Lines' },
    { id: 'split-sentences', label: 'Sentences to New Lines' },
    { id: 'smart-paragraphs', label: 'Smart Paragraphs' },
    { divider: true },
    { id: 'remove-duplicates', label: 'Remove Duplicates' },
    { id: 'remove-unique', label: 'Remove Unique' },
    { divider: true },
    { id: 'remove-blank', label: 'Remove Blank Lines' },
    { id: 'remove-all-spaces', label: 'Remove All Spaces' },
    { divider: true },
    { id: 'reverse', label: 'Reverse Lines' },
    { id: 'shuffle', label: 'Shuffle Lines' },
];

$effect(() => {
    const word = untrack(() => wordUnderCursor?.trim());

    if (spellcheckState.dictionaryLoaded && word && !selectedText && !spellcheckState.isWordValid(word)) {
        const cached = spellcheckState.getCachedSuggestions(word);
        if (cached) {
            suggestions = cached.slice(0, 5);
            isLoadingSuggestions = false;
            return;
        }

        isLoadingSuggestions = true;
        spellcheckState.getSuggestions(word)
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

const targetWord = $derived(
    (((selectedText || wordUnderCursor) as string) || '')
        .trim()
        .replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, ''),
);
const canAddSingle = $derived(
    targetWord.length > 1 && !/[a-z][A-Z]/.test(targetWord) && !spellcheckState.isWordValid(targetWord),
);

async function handleAddAll() {
    const matches = (selectedText as string).match(/\b[a-zA-Z']+\b/g) || [];
    const uniqueWords: string[] = Array.from(new Set(matches));
    const invalidWords = uniqueWords.filter((w: string) => !spellcheckState.isWordValid(w));

    const newDict = new SvelteSet([
        ...spellcheckState.customDictionary,
        ...invalidWords.map((w) => w.toLowerCase()),
    ]);
    invalidWords.forEach((w) => {
        spellcheckState.misspelledCache.delete(w.toLowerCase());
    });
    spellcheckState.customDictionary = newDict;

    onDictionaryUpdate?.();
    onClose();

    for (const word of invalidWords) await addToDictionary(word);
}

function handleOp(type: OperationId | undefined) {
    if (type) {
        performTextTransform(type);
        onClose();
    }
}

function closeMenuAndReset() {
    activeSubmenu = null;
    onClose();
}

async function handleSendToBrowser() {
    const text = selectedText.trim();
    if (!text) return;

    const urlPattern = /^(https?:\/\/|www\.)/i;
    const isUrl = urlPattern.test(text);

    if (isUrl) {
        const url = text.startsWith('www.') ? `https://${text}` : text;
        await openUrl(url);
    } else {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
        await openUrl(searchUrl);
    }
    closeMenuAndReset();
}
</script>

<ContextMenu {x} {y} onClose={closeMenuAndReset}>
    {#snippet children({ submenuSide: _submenuSide })}
        {#if suggestions.length > 0 || isLoadingSuggestions}
            <div class="text-ui-sm text-fg-muted px-3 py-1 font-bold uppercase opacity-50">
                Suggestions
            </div>
            {#if isLoadingSuggestions}
                <div
                    class="text-ui-sm flex w-full items-center gap-2 px-3 py-1.5 text-left opacity-70">
                    <Sparkles size={14} class="text-accent-secondary animate-spin" />
                    <span>Loading suggestions...</span>
                </div>
            {:else}
                {#each suggestions as s, i (i)}
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium"
                        onclick={() => onReplaceWord?.(s)}>
                        <Sparkles size={14} class="text-accent-secondary" /><span>{s}</span>
                    </button>
                {/each}
            {/if}
            <div class="bg-border-main my-1 h-px"></div>
        {/if}

        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            {#if selectedText}
                <button
                    type="button"
                    class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                    onclick={() => {
                        onCut?.();
                        closeMenuAndReset();
                    }}>
                    <Scissors size={14} /><span>Cut</span
                    ><span class="text-ui-sm ml-auto opacity-50">Ctrl+X</span>
                </button>
                <button
                    type="button"
                    class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                    onclick={() => {
                        onCopy?.();
                        closeMenuAndReset();
                    }}>
                    <ClipboardCopy size={14} /><span>Copy</span
                    ><span class="text-ui-sm ml-auto opacity-50">Ctrl+C</span>
                </button>
            {/if}
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={() => {
                    onPaste?.();
                    closeMenuAndReset();
                }}>
                <ClipboardPaste size={14} /><span>Paste</span
                ><span class="text-ui-sm ml-auto opacity-50">Ctrl+V</span>
            </button>

            {#if selectedText}
                <div class="bg-border-main my-1 h-px"></div>
                <button
                    type="button"
                    class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                    onclick={handleSendToBrowser}>
                    <Search size={14} />
                    <span>Send to browser</span>
                </button>
            {/if}

            <div class="bg-border-main my-1 h-px"></div>

            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={() => handleOp('format-document')}>
                <WandSparkles size={14} />
                <span>{selectedText ? 'Format Selection' : 'Format Document'}</span
                ><span class="text-ui-sm ml-auto opacity-50">Alt+Shift+F</span>
            </button>
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={() => handleOp('generate-toc')}>
                <List size={14} />
                <span>Generate Table of Contents</span>
            </button>
        </div>

        {#if selectedText}
            <div class="bg-border-main my-1 h-px"></div>

            <Submenu
                show={activeSubmenu === 'sort'}
                side={_submenuSide}
                onOpen={() => (activeSubmenu = 'sort')}
                onClose={() => {
                    if (activeSubmenu === 'sort') activeSubmenu = null;
                }}>
                {#snippet trigger()}
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left">
                        <ArrowUpDown size={14} /><span>Sort Lines</span
                        ><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each sortOps as op, i (i)}
                    {#if op.divider}
                        <div class="bg-border-main my-1 h-px"></div>
                    {:else}
                        <button
                            type="button"
                            class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                            onclick={() => handleOp(op.id)}>
                            {op.label}
                        </button>
                    {/if}
                {/each}
            </Submenu>

            <Submenu
                show={activeSubmenu === 'case'}
                side={_submenuSide}
                onOpen={() => (activeSubmenu = 'case')}
                onClose={() => {
                    if (activeSubmenu === 'case') activeSubmenu = null;
                }}>
                {#snippet trigger()}
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left">
                        <CaseSensitive size={14} /><span>Change Case</span
                        ><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each caseOps as op, i (i)}
                    {#if op.divider}
                        <div class="bg-border-main my-1 h-px"></div>
                    {:else}
                        <button
                            type="button"
                            class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                            onclick={() => handleOp(op.id)}>
                            {op.label}
                        </button>
                    {/if}
                {/each}
            </Submenu>

            <Submenu
                show={activeSubmenu === 'format'}
                side={_submenuSide}
                onOpen={() => (activeSubmenu = 'format')}
                onClose={() => {
                    if (activeSubmenu === 'format') activeSubmenu = null;
                }}>
                {#snippet trigger()}
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left">
                        <TextAlignStart size={14} /><span>Format Lines</span
                        ><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each formatOps as op, i (i)}
                    {#if op.divider}
                        <div class="bg-border-main my-1 h-px"></div>
                    {:else}
                        <button
                            type="button"
                            class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                            onclick={() => handleOp(op.id)}>
                            {op.label}
                        </button>
                    {/if}
                {/each}
            </Submenu>

            <Submenu
                show={activeSubmenu === 'transform'}
                side={_submenuSide}
                onOpen={() => (activeSubmenu = 'transform')}
                onClose={() => {
                    if (activeSubmenu === 'transform') activeSubmenu = null;
                }}>
                {#snippet trigger()}
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left">
                        <Rotate3d size={14} /><span>Transform Lines</span
                        ><span class="ml-auto opacity-50">›</span>
                    </button>
                {/snippet}
                {#each transformOps as op, i (i)}
                    {#if op.divider}
                        <div class="bg-border-main my-1 h-px"></div>
                    {:else}
                        <button
                            type="button"
                            class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                            onclick={() => handleOp(op.id)}>
                            {op.label}
                        </button>
                    {/if}
                {/each}
            </Submenu>
        {/if}

        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            {#if canAddSingle || (selectedText && selectedText.split(/\s+/).length > 1)}
                <div class="bg-border-main my-1 h-px"></div>
                {#if canAddSingle}
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                        onclick={async () => {
                            const newDict = new SvelteSet([
                                ...spellcheckState.customDictionary,
                                targetWord.toLowerCase(),
                            ]);
                            spellcheckState.customDictionary = newDict;

                            spellcheckState.misspelledCache.delete(targetWord.toLowerCase());

                            onDictionaryUpdate?.();
                            closeMenuAndReset();
                            await addToDictionary(targetWord);
                        }}>
                        <BookPlus size={14} />
                        <span class="truncate">Add "{targetWord}" to Dictionary</span
                        ><span class="text-ui-sm ml-auto opacity-50">F8</span>
                    </button>
                {/if}
                {#if selectedText && selectedText.split(/\s+/).length > 1}
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                        onclick={handleAddAll}>
                        <BookText size={14} /><span>Add All Invalid to Dictionary</span>
                    </button>
                {/if}
            {/if}
        </div>
    {/snippet}
</ContextMenu>
