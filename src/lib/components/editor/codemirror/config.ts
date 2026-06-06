import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  closeBracketsKeymap,
  completeAnyWord,
  completionKeymap,
} from '@codemirror/autocomplete';
import { copyLineDown, defaultKeymap, historyKeymap, selectLine } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { EditorView, type KeyBinding, keymap } from '@codemirror/view';
import { addBookmark } from '$lib/stores/bookmarkStore.svelte';
import { toggleInsertMode } from '$lib/stores/editorMetrics.svelte';
import { performTextTransform } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { showToast } from '$lib/stores/toastStore.svelte';
import { toggleSelectionComment } from '$lib/utils/commentToggle';

// Keys from defaultKeymap that our custom bindings must override
const FILTERED_DEFAULT_KEYS = new Set(['Mod-i', 'Mod-I', 'Mod-d', 'Mod-b', 'Alt-l']);

const markdownKeymap: KeyBinding[] = [
  {
    key: 'Mod-b',
    run: () => {
      performTextTransform('bold');
      return true;
    },
    preventDefault: true,
  },
  {
    key: 'Mod-i',
    run: () => {
      performTextTransform('italic');
      return true;
    },
    preventDefault: true,
  },
  {
    key: 'Mod-k',
    run: () => {
      performTextTransform('insert-link');
      return true;
    },
    preventDefault: true,
  },
  {
    key: 'Mod-d',
    run: () => {
      const tab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
      if (tab?.path) {
        addBookmark(tab.path, tab.title).then(({ isNew }) => {
          if (isNew) {
            showToast('success', `Added "${tab.title}" to bookmarks`);
          } else {
            showToast('info', `"${tab.title}" is already bookmarked`);
          }
        });
      } else {
        showToast('warning', 'Save the file before bookmarking');
      }
      return true;
    },
    preventDefault: true,
  },
];

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
  if (!appContext.app.enableAutocomplete) return [];
  return autocompletion({
    activateOnTyping: true,
    activateOnTypingDelay: appContext.app.autocompleteDelay,
    closeOnBlur: true,
    defaultKeymap: true,
    aboveCursor: false,
    maxRenderedOptions: 100,
    override: [smartCompleteAnyWord],
  });
}

export function createWrapExtension() {
  const wrapEnabled = appContext.app.editorWordWrap;
  const column = appContext.app.wrapGuideColumn;
  const extensions = [];
  if (wrapEnabled) {
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

export function createDoubleClickHandler() {
  if (!appContext.app.doubleClickSelectsTrailingSpace) return [];
  return EditorView.domEventHandlers({
    dblclick: (event, view) => {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const range = view.state.wordAt(pos);
      if (!range) return false;
      let end = range.to;
      if (end < view.state.doc.length) {
        const nextChar = view.state.doc.sliceString(end, end + 1);
        if (nextChar === ' ' || nextChar === '\t') end++;
      }
      if (end > range.to) {
        view.dispatch({ selection: { anchor: range.from, head: end } });
        event.preventDefault();
        return true;
      }
      return false;
    },
  });
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

export function getEditorKeymap(customKeymap: KeyBinding[] = []) {
  return keymap.of([
    ...customKeymap,
    {
      key: 'Insert',
      run: () => {
        toggleInsertMode();
        return true;
      },
    },
    { key: 'Mod-/', run: toggleSelectionComment },
    ...markdownKeymap,
    {
      key: 'Mod-l',
      run: selectLine,
    },
    {
      key: 'Mod-Shift-d',
      run: copyLineDown,
    },
    ...(completionKeymap as KeyBinding[]),
    ...(historyKeymap as KeyBinding[]),
    ...(closeBracketsKeymap as KeyBinding[]),
    ...(defaultKeymap.filter(
      (binding) => binding.key !== 'Tab' && !FILTERED_DEFAULT_KEYS.has(binding.key ?? ''),
    ) as KeyBinding[]),
    { key: 'Tab', run: handleTabKey, shift: handleShiftTab },
  ]);
}
