<script lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
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
} from "lucide-svelte";
import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { _ } from "svelte-i18n";
import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
import Submenu from "$lib/components/ui/Submenu.svelte";
import type { OperationId } from "$lib/config/textOperationsRegistry";
import { translate } from "$lib/i18n";
import { addToDictionary } from "$lib/services/dictionaryService";
import { performTextTransform } from "$lib/stores/editorStore.svelte";
import { recordCommandUsage } from "$lib/stores/settingsState.svelte";
import { shortcutManager } from "$lib/utils/shortcuts";
import { spellcheckState } from "$lib/utils/spellcheck.svelte";

function opShortcut(opId: string): string {
  return shortcutManager.getShortcutDisplay(`textop.${opId}`);
}

const cutShortcut = shortcutManager.formatKeyDisplay("ctrl+x");
const copyShortcut = shortcutManager.formatKeyDisplay("ctrl+c");
const pasteShortcut = shortcutManager.formatKeyDisplay("ctrl+v");

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

let activeSubmenu = $state<"sort" | "case" | "format" | "transform" | null>(null);
let suggestions = $state<string[]>([]);
let isLoadingSuggestions = $state(false);

type MenuOption = {
  id?: OperationId;
  label?: string;
  divider?: boolean;
};

function opLabel(id: OperationId): string {
  return `textOps.op.${id}`;
}

const menuOp = (id: OperationId): MenuOption => ({ id, label: opLabel(id) });

const sortOps: MenuOption[] = [
  menuOp("sort-asc"),
  menuOp("sort-case-sensitive-asc"),
  menuOp("sort-numeric-asc"),
  menuOp("sort-length-asc"),
  { divider: true },
  menuOp("sort-desc"),
  menuOp("sort-case-sensitive-desc"),
  menuOp("sort-numeric-desc"),
  menuOp("sort-length-desc"),
  { divider: true },
  menuOp("reverse"),
  menuOp("shuffle"),
];

const caseOps: MenuOption[] = [
  menuOp("uppercase"),
  menuOp("lowercase"),
  { divider: true },
  menuOp("upper-case-first"),
  menuOp("lower-case-first"),
  { divider: true },
  menuOp("title-case"),
  menuOp("sentence-case"),
  menuOp("capital-case"),
  menuOp("no-case"),
  { divider: true },
  menuOp("camel-case"),
  menuOp("pascal-case"),
  menuOp("snake-case"),
  menuOp("kebab-case"),
  menuOp("constant-case"),
  menuOp("dot-case"),
  menuOp("path-case"),
  menuOp("header-case"),
  { divider: true },
  menuOp("swap-case"),
];

const formatOps: MenuOption[] = [
  menuOp("indent-lines"),
  menuOp("unindent-lines"),
  menuOp("trim-whitespace"),
  menuOp("normalize-whitespace"),
  { divider: true },
  menuOp("toggle-bullets"),
  menuOp("add-numbers"),
  menuOp("add-checkboxes"),
  { divider: true },
  menuOp("toggle-blockquote"),
  menuOp("toggle-code-fence"),
  { divider: true },
  menuOp("increase-heading"),
  menuOp("decrease-heading"),
  { divider: true },
  menuOp("hard-wrap"),
  menuOp("wrap-quotes"),
];

const transformOps: MenuOption[] = [
  menuOp("join-lines"),
  menuOp("split-sentences"),
  menuOp("smart-paragraphs"),
  { divider: true },
  menuOp("remove-duplicates"),
  menuOp("remove-unique"),
  { divider: true },
  menuOp("remove-blank"),
  menuOp("remove-all-spaces"),
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
    spellcheckState
      .getSuggestions(word)
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
  (((selectedText || wordUnderCursor) as string) || "").trim().replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, ""),
);
const canAddSingle = $derived(
  targetWord.length > 1 && !/[a-z][A-Z]/.test(targetWord) && !spellcheckState.isWordValid(targetWord),
);
const invalidWordsInSelection = $derived<string[]>(findInvalidWords(selectedText));
const hasMultipleWords = $derived(selectedText.trim().split(/\s+/).length > 1);
const canAddAll = $derived(invalidWordsInSelection.length > 0 && hasMultipleWords);

function findInvalidWords(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b[a-zA-Z']+\b/g) || [];
  const uniqueWords = Array.from(new Set(matches));
  return uniqueWords.filter((w) => !spellcheckState.isWordValid(w));
}

async function handleAddAll() {
  const invalidWords = invalidWordsInSelection.map((w) => w.toLowerCase());

  const newDict = new SvelteSet([...spellcheckState.customDictionary, ...invalidWords]);
  invalidWords.forEach((w) => {
    spellcheckState.misspelledCache.delete(w);
  });
  spellcheckState.customDictionary = newDict;

  onDictionaryUpdate?.();
  onClose();

  for (const word of invalidWords) await addToDictionary(word);
}

function handleOp(type: OperationId | undefined) {
  if (type) {
    performTextTransform(type);
    recordCommandUsage(`textop.${type}`);
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
    const url = text.startsWith("www.") ? `https://${text}` : text;
    await openUrl(url);
  } else {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
    await openUrl(searchUrl);
  }
  closeMenuAndReset();
}
</script>

<ContextMenu {x} {y} onClose={closeMenuAndReset}>
  {#snippet children({
  submenuSide: _submenuSide,
})}
    {#snippet opSubmenu(
  IconCmp: typeof ArrowUpDown,
  label: string,
  key: "sort" | "case" | "format" | "transform",
  ops: MenuOption[],
)}
      <Submenu
        show={activeSubmenu === key}
        side={_submenuSide}
        onOpen={() => (activeSubmenu = key)}
        onClose={() => {
  if (activeSubmenu === key) activeSubmenu = null;
}}
      >
        {#snippet trigger()}
          <button type="button" class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left">
            <IconCmp size={14} /><span>{label}</span><span class="ml-auto opacity-50">›</span>
          </button>
        {/snippet}
        {#each ops as op, i (i)}
          {#if op.divider}
            <div class="bg-border-main my-1 h-px"></div>
          {:else}
            {@const id = op.id}
            <button
              type="button"
              class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
              onclick={() => handleOp(id)}
            >
              <span class="flex-1">{translate(op.label ?? "")}</span>
              {#if id && opShortcut(id)}
                <span class="text-xs opacity-40">{opShortcut(id)}</span>
              {/if}
            </button>
          {/if}
        {/each}
      </Submenu>
    {/snippet}

    {#if suggestions.length > 0 || isLoadingSuggestions || canAddSingle || canAddAll}
      {#if suggestions.length > 0 || isLoadingSuggestions}
        <div class="text-ui-sm text-fg-muted px-3 py-1 font-bold uppercase opacity-50">
          {$_("editorContextMenu.suggestions")}
        </div>
      {/if}
      {#if isLoadingSuggestions}
        <div class="text-ui-sm flex w-full items-center gap-2 px-3 py-1.5 text-left opacity-70">
          <Sparkles size={14} class="text-accent-secondary animate-spin" />
          <span>{$_("editorContextMenu.loadingSuggestions")}</span>
        </div>
      {:else}
        {#each suggestions as s, i (i)}
          <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium"
            onclick={() => onReplaceWord?.(s)}
          >
            <Sparkles size={14} class="text-accent-secondary" /><span>{s}</span>
          </button>
        {/each}
        {#if canAddSingle}
          <div class="bg-border-main my-1 h-px"></div>
          <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={async () => {
  const newDict = new SvelteSet([...spellcheckState.customDictionary, targetWord.toLowerCase()]);
  spellcheckState.customDictionary = newDict;

  spellcheckState.misspelledCache.delete(targetWord.toLowerCase());

  onDictionaryUpdate?.();
  closeMenuAndReset();
  await addToDictionary(targetWord);
}}
          >
            <BookPlus size={14} />
            <span class="truncate">{$_("editorContextMenu.addToDictionary", { values: { word: targetWord } })}</span
            ><span class="text-ui-sm ml-auto opacity-50">F8</span>
          </button>
        {/if}
        {#if canAddAll}
          <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={handleAddAll}
          >
            <BookText size={14} /><span>{$_("editorContextMenu.addAllInvalid")}</span>
          </button>
        {/if}
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
}}
        >
          <Scissors size={14} /><span>{$_("editorContextMenu.cut")}</span
          ><span class="text-ui-sm ml-auto opacity-50">{cutShortcut}</span>
        </button>
        <button
          type="button"
          class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
          onclick={() => {
  onCopy?.();
  closeMenuAndReset();
}}
        >
          <ClipboardCopy size={14} /><span>{$_("editorContextMenu.copy")}</span
          ><span class="text-ui-sm ml-auto opacity-50">{copyShortcut}</span>
        </button>
      {/if}
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={() => {
  onPaste?.();
  closeMenuAndReset();
}}
      >
        <ClipboardPaste size={14} /><span>{$_("editorContextMenu.paste")}</span
        ><span class="text-ui-sm ml-auto opacity-50">{pasteShortcut}</span>
      </button>
    </div>

    <div class="bg-border-main my-1 h-px"></div>

    <button
      type="button"
      class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
      onclick={() => handleOp("format-document")}
    >
      <WandSparkles size={14} />
      <span class="flex-1"
        >{selectedText ? $_("editorContextMenu.formatSelection") : $_("editorContextMenu.formatDocument")}</span
      >
      {#if opShortcut("format-document")}
        <span class="text-xs opacity-40">{opShortcut("format-document")}</span>
      {/if}
    </button>

    {#if selectedText}
      <div class="bg-border-main my-1 h-px"></div>
      {@render opSubmenu(CaseSensitive, $_("editorContextMenu.changeCase"), "case", caseOps)}
      {@render opSubmenu(TextAlignStart, $_("editorContextMenu.formatLines"), "format", formatOps)}
      {@render opSubmenu(ArrowUpDown, $_("editorContextMenu.sortLines"), "sort", sortOps)}
      {@render opSubmenu(Rotate3d, $_("editorContextMenu.transformLines"), "transform", transformOps)}
    {/if}

    <div class="bg-border-main my-1 h-px"></div>

    <button
      type="button"
      class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
      onclick={() => handleOp("generate-toc")}
    >
      <List size={14} />
      <span class="flex-1">{$_("editorContextMenu.generateToc")}</span>
      {#if opShortcut("generate-toc")}
        <span class="text-xs opacity-40">{opShortcut("generate-toc")}</span>
      {/if}
    </button>

    {#if selectedText}
      <div class="bg-border-main my-1 h-px"></div>
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={handleSendToBrowser}
      >
        <Search size={14} />
        <span>{$_("editorContextMenu.sendToBrowser")}</span>
      </button>
    {/if}
  {/snippet}
</ContextMenu>
