import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  closeBracketsKeymap,
  completeAnyWord,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, deleteGroupForwardWin, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorSelection } from "@codemirror/state";
import { EditorView, type KeyBinding, keymap } from "@codemirror/view";
import { commands } from "$lib/commands/commands";
import { cmHandlerMap } from "$lib/components/editor/codemirror/editorBindings";
import { recordCommandUsage } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { emojiAutocompleteKeymap, emojiCompletion } from "$lib/utils/emojiCompletion";
import { fenceCursorPlugin, fenceLanguageCompletion } from "$lib/utils/fenceLanguageCompletion";
import { resolveShortcut } from "$lib/utils/shortcuts";

// CodeMirror compares key names case-sensitively against `event.key` ("ArrowUp",
// "PageDown", ...), so title-casing only works for single-word names.
const CM_KEY_NAMES: Record<string, string> = {
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  pageup: "PageUp",
  pagedown: "PageDown",
  capslock: "CapsLock",
  numlock: "NumLock",
  scrolllock: "ScrollLock",
  printscreen: "PrintScreen",
  contextmenu: "ContextMenu",
};

export function toCmKey(registryKey: string): string {
  const parts = registryKey.split("+").map((p) => p.toLowerCase());
  const mods: string[] = [];
  let keyPart = "";
  for (const p of parts) {
    if (p === "ctrl" || p === "meta") {
      mods.push("Mod");
    } else if (p === "shift") {
      mods.push("Shift");
    } else if (p === "alt") {
      mods.push("Alt");
    } else {
      keyPart = p.length === 1 ? p : (CM_KEY_NAMES[p] ?? p[0].toUpperCase() + p.slice(1));
    }
  }
  return [...mods, keyPart].join("-");
}

/**
 * Custom completion source that wraps completeAnyWord but filters out
 * candidates that match the currently typed word exactly.
 */
export async function smartCompleteAnyWord(context: CompletionContext): Promise<CompletionResult | null> {
  const result = await completeAnyWord(context);
  if (!result) return null;

  const before = context.matchBefore(/\w+/);
  if (!before) return result;

  const typed = before.text;

  // Filter out exact matches
  const filteredOptions = result.options.filter((opt) => opt.label !== typed);

  if (filteredOptions.length === 0) return null;

  return {
    ...result,
    options: filteredOptions,
  };
}

export function getAutocompletionConfig() {
  if (appContext.settings.autocompleteDelay < 0) return [];
  return [
    emojiAutocompleteKeymap,
    fenceCursorPlugin,
    autocompletion({
      activateOnTyping: true,
      activateOnTypingDelay: appContext.settings.autocompleteDelay,
      closeOnBlur: true,
      defaultKeymap: true,
      aboveCursor: false,
      maxRenderedOptions: 100,
      override: [emojiCompletion, fenceLanguageCompletion, smartCompleteAnyWord],
    }),
  ];
}

export function createWrapExtension(isLargeFile = false) {
  if (isLargeFile) return [];
  const column = appContext.settings.wrapGuideColumn;
  const extensions = [];
  if (column >= 0) {
    extensions.push(EditorView.lineWrapping);
    if (column > 0) {
      extensions.push(
        EditorView.theme({
          ".cm-content": { maxWidth: `${column}ch` },
          ".cm-scroller": { width: "100%" },
        }),
      );
    }
  }
  return extensions;
}

// Tab indents the selected lines via CodeMirror's `indentMore`, or inserts the
// configured indent at each cursor (no built-in inserts `indentUnit` as spaces;
// `insertTab` inserts a literal tab). Shift+Tab is `indentLess`.
const handleTabKey = (view: EditorView) => {
  const { state } = view;

  if (state.selection.ranges.some((range) => !range.empty)) {
    return indentMore(view);
  }

  const indentStr = state.facet(indentUnit) || "    ";
  view.dispatch({
    ...state.changeByRange((range) => ({
      changes: { from: range.from, insert: indentStr },
      range: EditorSelection.cursor(range.from + indentStr.length),
    })),
    scrollIntoView: true,
  });
  return true;
};

const commandDefaultKeys = new Map<string, string>();
for (const cmd of commands) {
  if (cmd.defaultKey) {
    commandDefaultKeys.set(cmd.id, cmd.defaultKey);
  }
}

const IS_MAC = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

// Settings and CodeMirror's default map write the same chord in different
// orders ("Mod-Shift-k" vs "Shift-Mod-k"), so compare them in one form.
export function canonicalKey(key: string): string {
  const parts = key.split("-");
  const keyName = parts.pop() ?? "";
  const mods = new Set<string>();
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "mod") mods.add(IS_MAC ? "Meta" : "Ctrl");
    else if (lower === "ctrl" || lower === "control") mods.add("Ctrl");
    else if (lower === "meta" || lower === "cmd") mods.add("Meta");
    else if (lower === "alt") mods.add("Alt");
    else if (lower === "shift") mods.add("Shift");
  }
  return [...["Alt", "Ctrl", "Meta", "Shift"].filter((mod) => mods.has(mod)), keyName].join("-");
}

function addFilteredKey(keys: Set<string>, cmKey: string): void {
  const key = canonicalKey(cmKey);
  keys.add(key);
  const lastChar = key.at(-1);
  if (lastChar && /^[a-zA-Z]$/.test(lastChar)) {
    const prefix = key.slice(0, -1);
    keys.add(prefix + lastChar.toUpperCase());
    keys.add(prefix + lastChar.toLowerCase());
  }
}

export function getEditorKeymap(customKeymap: KeyBinding[] = []) {
  const cmBindings: KeyBinding[] = [];
  const filteredKeys = new Set<string>();

  for (const def of cmHandlerMap) {
    const customKey = appContext.settings.customShortcuts[def.registryKey];
    const defaultKey = commandDefaultKeys.get(def.registryKey);
    const key = resolveShortcut(customKey, defaultKey);
    if (!key) {
      // Still free the default chord, or CodeMirror's default map keeps running it.
      if (defaultKey) addFilteredKey(filteredKeys, toCmKey(defaultKey));
      continue;
    }
    const cmKey = toCmKey(key);

    cmBindings.push({
      key: cmKey,
      run: (view) => {
        recordCommandUsage(def.registryKey);
        return def.handler(view);
      },
      preventDefault: true,
    });
    addFilteredKey(filteredKeys, cmKey);

    // A custom key replaces the default: free the old one, or the default
    // keymap below still runs the command on it.
    if (customKey && defaultKey) addFilteredKey(filteredKeys, toCmKey(defaultKey));
  }

  return keymap.of([
    ...customKeymap,
    ...cmBindings,
    ...(completionKeymap as KeyBinding[]),
    ...(historyKeymap as KeyBinding[]),
    ...(closeBracketsKeymap as KeyBinding[]),
    { key: "Mod-Delete", mac: "Alt-Delete", run: deleteGroupForwardWin, preventDefault: true },
    ...(defaultKeymap.filter(
      (binding) =>
        binding.key !== "Tab" && binding.key !== "Mod-Delete" && !filteredKeys.has(canonicalKey(binding.key ?? "")),
    ) as KeyBinding[]),
    { key: "Tab", run: handleTabKey, shift: indentLess },
  ]);
}
