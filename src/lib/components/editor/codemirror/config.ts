import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  closeBracketsKeymap,
  completeAnyWord,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { EditorView, type KeyBinding, keymap } from '@codemirror/view';
import { commands } from '$lib/commands/commands';
import { cmHandlerMap } from '$lib/components/editor/codemirror/editorBindings';
import { appContext } from '$lib/stores/state.svelte';

function toCmKey(registryKey: string): string {
  const parts = registryKey.split('+').map((p) => p.toLowerCase());
  const mods: string[] = [];
  let keyPart = '';
  for (const p of parts) {
    if (p === 'ctrl' || p === 'meta') {
      mods.push('Mod');
    } else if (p === 'shift') {
      mods.push('Shift');
    } else if (p === 'alt') {
      mods.push('Alt');
    } else {
      keyPart = p.length === 1 ? p : p[0].toUpperCase() + p.slice(1);
    }
  }
  return [...mods, keyPart].join('-');
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
  return autocompletion({
    activateOnTyping: true,
    activateOnTypingDelay: appContext.settings.autocompleteDelay,
    closeOnBlur: true,
    defaultKeymap: true,
    aboveCursor: false,
    maxRenderedOptions: 100,
    override: [smartCompleteAnyWord],
  });
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
          '.cm-content': { maxWidth: `${column}ch` },
          '.cm-scroller': { width: '100%' },
        }),
      );
    }
  }
  return extensions;
}

// Custom tab handler that indents selection or inserts spaces at cursor
const handleTabKey = (view: EditorView) => {
  const { state } = view;
  const { from, to } = state.selection.main;
  const hasSelection = from !== to;

  // Get indent string from the indentUnit facet
  const indentStr = state.facet(indentUnit) || '    '; // Default to 4 spaces

  if (hasSelection) {
    // Indent selected lines
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);

    const changes = [];
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      changes.push({ from: line.from, insert: indentStr });
    }

    view.dispatch({
      changes,
      scrollIntoView: true,
    });
    return true;
  }

  // Insert spaces at cursor position
  view.dispatch({
    changes: { from, to, insert: indentStr },
    selection: { anchor: from + indentStr.length },
    scrollIntoView: true,
  });
  return true;
};

// Shift+Tab handler that unindents selected lines
const handleShiftTab = (view: EditorView) => {
  const { state } = view;
  const { from, to } = state.selection.main;
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(to);

  // Get indent string from the indentUnit facet
  const indentStr = state.facet(indentUnit) || '    '; // Default to 4 spaces
  const indentLen = indentStr.length;

  const changes = [];
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    const lineText = line.text;

    // Check if line starts with the indent string
    if (lineText.startsWith(indentStr)) {
      changes.push({ from: line.from, to: line.from + indentLen, insert: '' });
    } else {
      // Remove as many leading spaces as possible (up to indentLen)
      let removeCount = 0;
      for (let j = 0; j < Math.min(indentLen, lineText.length); j++) {
        if (lineText[j] === ' ') removeCount++;
        else break;
      }
      if (removeCount > 0) {
        changes.push({ from: line.from, to: line.from + removeCount, insert: '' });
      }
    }
  }

  if (changes.length > 0) {
    view.dispatch({
      changes,
      scrollIntoView: true,
    });
  }
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
    const cmKey = customKey ? toCmKey(customKey) : toCmKey(commandDefaultKeys.get(def.registryKey) ?? '');

    cmBindings.push({ key: cmKey, run: def.handler, preventDefault: true });
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
    ...(defaultKeymap.filter(
      (binding) => binding.key !== 'Tab' && !filteredKeys.has(binding.key ?? ''),
    ) as KeyBinding[]),
    { key: 'Tab', run: handleTabKey, shift: handleShiftTab },
  ]);
}
