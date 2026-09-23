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
import { EditorView, type KeyBinding, keymap } from "@codemirror/view";
import { commands } from "$lib/commands/commands";
import { cmHandlerMap } from "$lib/components/editor/codemirror/editorBindings";
import { recordCommandUsage } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { emojiAutocompleteKeymap, emojiCompletion } from "$lib/utils/emojiCompletion";
import { fenceCursorPlugin, fenceLanguageCompletion } from "$lib/utils/fenceLanguageCompletion";

function toCmKey(registryKey: string): string {
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
      keyPart = p.length === 1 ? p : p[0].toUpperCase() + p.slice(1);
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
// configured indent at the cursor (no built-in inserts `indentUnit` as spaces;
// `insertTab` inserts a literal tab). Shift+Tab is `indentLess`.
const handleTabKey = (view: EditorView) => {
  const { state } = view;
  const { from, to } = state.selection.main;

  if (from !== to) {
    return indentMore(view);
  }

  const indentStr = state.facet(indentUnit) || "    ";
  view.dispatch({
    changes: { from, to, insert: indentStr },
    selection: { anchor: from + indentStr.length },
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

export function getEditorKeymap(customKeymap: KeyBinding[] = []) {
  const cmBindings: KeyBinding[] = [];
  const filteredKeys = new Set<string>();

  for (const def of cmHandlerMap) {
    const customKey = appContext.settings.customShortcuts[def.registryKey];
    const cmKey = customKey ? toCmKey(customKey) : toCmKey(commandDefaultKeys.get(def.registryKey) ?? "");

    cmBindings.push({
      key: cmKey,
      run: (view) => {
        recordCommandUsage(def.registryKey);
        return def.handler(view);
      },
      preventDefault: true,
    });
    filteredKeys.add(cmKey);

    const lastChar = cmKey.at(-1);
    if (lastChar && /^[a-zA-Z]$/.test(lastChar)) {
      const prefix = cmKey.slice(0, -1);
      filteredKeys.add(prefix + lastChar.toUpperCase());
      filteredKeys.add(prefix + lastChar.toLowerCase());
    }
  }

  return keymap.of([
    ...customKeymap,
    ...cmBindings,
    ...(completionKeymap as KeyBinding[]),
    ...(historyKeymap as KeyBinding[]),
    ...(closeBracketsKeymap as KeyBinding[]),
    { key: "Mod-Delete", mac: "Alt-Delete", run: deleteGroupForwardWin, preventDefault: true },
    ...(defaultKeymap.filter(
      (binding) => binding.key !== "Tab" && binding.key !== "Mod-Delete" && !filteredKeys.has(binding.key ?? ""),
    ) as KeyBinding[]),
    { key: "Tab", run: handleTabKey, shift: indentLess },
  ]);
}
