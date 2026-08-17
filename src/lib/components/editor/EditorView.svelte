<script lang="ts">
import { history, historyField } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightWhitespace, type KeyBinding } from '@codemirror/view';
import { onMount, untrack } from 'svelte';
import {
  createWrapExtension,
  getAutocompletionConfig,
  getEditorKeymap,
} from '$lib/components/editor/codemirror/config';
import type { ContextMenuCallback } from '$lib/components/editor/codemirror/events';
import {
  type Compartments,
  createBaseExtensions,
  getTabDirectory,
  markdownExtensions,
  resolveFileLanguage,
} from '$lib/components/editor/logic/extensions';
import { setupModifierKeyHandler } from '$lib/components/editor/logic/modifierKeys';
import { setupSelectionDragScroll } from '$lib/components/editor/logic/selectionScroll';
import { TabSyncManager } from '$lib/components/editor/logic/tabSync';
import { createUpdateListener } from '$lib/components/editor/logic/updateListener';
import type { EditorMetrics } from '$lib/stores/editorMetrics.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { restoreScrollByTopLine, ScrollManager } from '$lib/utils/cmScroll';
import { getActiveEditorView, setActiveEditorView } from '$lib/utils/editorCommands';
import { newlinePlugin, selectionWhitespacePlugin } from '$lib/utils/editorPlugins';
import { generateDynamicTheme } from '$lib/utils/editorTheme';
import { linkPlugin, linkTheme } from '$lib/utils/filePathExtension';
import { createFoldExtensions } from '$lib/utils/foldExtension';
import { createImagePasteExtension } from '$lib/utils/imagePaste';
import type { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { createMarkdownDecorationsPlugin } from '$lib/utils/markdownExtensions';
import { createMarkdownLinter } from '$lib/utils/markdownLintExtension.svelte';
import { createRecentChangesHighlighter } from '$lib/utils/recentChangesExtension';
import { scrollSync } from '$lib/utils/scrollSync.svelte';
import { searchState, updateSearchEditor } from '$lib/utils/searchManager.svelte';
import { spellcheckState } from '$lib/utils/spellcheck.svelte';
import { createSpellCheckLinter } from '$lib/utils/spellcheckExtension.svelte';
import type { AppEditorView } from '../../../global';

let {
  tabId,
  initialContent = '',
  isMarkdown = true,
  isLargeFile = false,
  filePath,
  initialScrollTop = 0,
  initialTopLine = 0,
  initialSelection = { anchor: 0, head: 0 },
  initialHistoryState,
  lineChangeTracker,
  onContentChange,
  onMetricsChange,
  onScrollChange,
  onSelectionChange,
  onHistoryUpdate,
  customKeymap = [],
  eventHandlers,
  onContextMenu,
  cmView = $bindable(),
} = $props<{
  tabId: string;
  initialContent?: string;
  isMarkdown?: boolean;
  isLargeFile?: boolean;
  filePath?: string;
  initialScrollTop?: number;
  initialTopLine?: number;
  initialSelection?: { anchor: number; head: number };
  initialHistoryState?: unknown;
  lineChangeTracker: LineChangeTracker | undefined;
  onContentChange: (content: string, lineCount: number) => void;
  onMetricsChange: (metrics: Partial<EditorMetrics>) => void;
  onScrollChange?: (percentage: number, scrollTop: number, topLine: number) => void;
  onSelectionChange?: (anchor: number, head: number) => void;
  onHistoryUpdate?: (state: unknown) => void;
  customKeymap?: readonly KeyBinding[];
  eventHandlers: Extension;
  onContextMenu?: ContextMenuCallback;
  cmView?: AppEditorView;
}>();

let editorContainer = $state<HTMLDivElement>();
let view = $state<AppEditorView>();

let scrollManager = new ScrollManager();
let tabSync = new TabSyncManager(scrollManager);
let gutterObserver: ResizeObserver | null = null;

function setupGutterObserver() {
  gutterObserver?.disconnect();
  const container = editorContainer;
  if (!container) return;
  const gutterEl = container.querySelector('.cm-gutters');
  if (gutterEl) {
    gutterObserver = new ResizeObserver(() => {
      onMetricsChange({ gutterWidth: (gutterEl as HTMLElement).offsetWidth });
    });
    gutterObserver.observe(gutterEl);
    onMetricsChange({ gutterWidth: (gutterEl as HTMLElement).offsetWidth });
  }
}

let comps: Compartments = {
  wrapComp: new Compartment(),
  autoComp: new Compartment(),
  recentComp: new Compartment(),
  historyComp: new Compartment(),
  themeComp: new Compartment(),
  indentComp: new Compartment(),
  spellComp: new Compartment(),
  whitespaceComp: new Compartment(),
  languageComp: new Compartment(),
  handlersComp: new Compartment(),
  rulerComp: new Compartment(),
  filePathComp: new Compartment(),
  markdownLintComp: new Compartment(),
  decorationComp: new Compartment(),
  foldComp: new Compartment(),
  keymapComp: new Compartment(),
  imagePasteComp: new Compartment(),
};

let effectiveMarkdown = $derived(isMarkdown && !isLargeFile);
let autocompletionConfig = $derived(isLargeFile ? [] : getAutocompletionConfig());

$effect(() => {
  cmView = view;
});

$effect(() => {
  const tId = tabId;
  const forceSyncCounter = appContext.editor.tabs.find((t) => t.id === tId)?.forceSync ?? 0;
  untrack(() => {
    if (!view) return;
    tabSync.process(view, tId, forceSyncCounter, createExtensions, onMetricsChange);
    view.requestMeasure({
      read: () => undefined,
      write: () => setupGutterObserver(),
    });
  });
});

$effect(() => {
  if (!view) return;
  const theme = appContext.settings.theme;
  const fontSize = appContext.settings.editorFontSize;
  const fontFamily = appContext.settings.editorFontFamily;
  view.dispatch({ effects: comps.themeComp.reconfigure(generateDynamicTheme(fontSize, fontFamily, theme === 'dark')) });
});

$effect(() => {
  if (!view) return;
  view.dispatch({ effects: comps.keymapComp.reconfigure(getEditorKeymap([...customKeymap])) });
});

$effect(() => {
  if (!view) return;
  view.dispatch({ effects: comps.historyComp.reconfigure(history({ minDepth: appContext.settings.undoDepth })) });
});

$effect(() => {
  if (!view) return;
  view.dispatch({
    effects: comps.indentComp.reconfigure(indentUnit.of(' '.repeat(Math.max(1, appContext.settings.defaultIndent)))),
  });
});

$effect(() => {
  if (!view) return;
  const showWs = appContext.settings.showWhitespace;
  view.dispatch({
    effects: comps.whitespaceComp.reconfigure(
      showWs ? [highlightWhitespace(), newlinePlugin] : [selectionWhitespacePlugin],
    ),
  });
});

$effect(() => {
  if (!view) return;
  view.dispatch({ effects: comps.wrapComp.reconfigure(createWrapExtension(isLargeFile)) });
});

$effect(() => {
  if (!view) return;
  if (isLargeFile) return;
  view.dispatch({
    effects: comps.recentComp.reconfigure(createRecentChangesHighlighter(lineChangeTracker, onContextMenu)),
  });
});

$effect(() => {
  if (!view) return;
  const dictLoaded = spellcheckState.dictionaryLoaded;
  tabId;
  if (!dictLoaded) return;
  if (isLargeFile) return;
  view.dispatch({ effects: comps.spellComp.reconfigure(createSpellCheckLinter()) });
});

$effect(() => {
  if (!view) return;
  const md = effectiveMarkdown;
  view.dispatch({
    effects: [
      comps.foldComp.reconfigure(md ? createFoldExtensions() : []),
      comps.filePathComp.reconfigure(md ? [linkPlugin, linkTheme] : []),
      comps.markdownLintComp.reconfigure(md ? createMarkdownLinter() : []),
      comps.imagePasteComp.reconfigure(md ? createImagePasteExtension() : []),
    ],
  });
});

$effect(() => {
  if (!view) return;
  const md = effectiveMarkdown;
  const rendered = appContext.settings.viewMode === 'rendered';
  view.dispatch({
    effects: comps.decorationComp.reconfigure(md ? createMarkdownDecorationsPlugin(rendered, getTabDirectory) : []),
  });
});

$effect(() => {
  if (!view) return;
  const md = effectiveMarkdown;

  if (md || isLargeFile) {
    view.dispatch({ effects: comps.languageComp.reconfigure(md ? markdownExtensions : []) });
    return;
  }

  const path = filePath;
  const description = path ? resolveFileLanguage(path) : null;
  if (!description) {
    view.dispatch({ effects: comps.languageComp.reconfigure([]) });
    return;
  }

  const currentView = view;
  let cancelled = false;
  const pathAtDispatch = path;
  void description
    .load()
    .then((support) => {
      if (cancelled || currentView._currentTabId !== tabId || filePath !== pathAtDispatch) return;
      currentView.dispatch({ effects: comps.languageComp.reconfigure(support) });
    })
    .catch(() => {});

  return () => {
    cancelled = true;
  };
});

$effect(() => {
  if (!view) return;
  view.dispatch({ effects: comps.autoComp.reconfigure(autocompletionConfig) });
});

$effect(() => {
  if (!view) return;
  view.dispatch({ effects: comps.handlersComp.reconfigure(eventHandlers) });
});

function createExtensions(currentHistoryState: unknown): Extension[] {
  const extensions = createBaseExtensions({
    currentHistoryState,
    lineChangeTracker: isLargeFile ? undefined : lineChangeTracker,
    autocompletionConfig,
    isMarkdown: effectiveMarkdown,
    isLargeFile,
    customKeymap,
    eventHandlers,
    compartments: comps,
    onContextMenu,
  });
  extensions.push(
    createUpdateListener(
      () => view?._currentTabId,
      onContentChange,
      onMetricsChange,
      tabSync.timerRefs,
      onSelectionChange,
      onHistoryUpdate,
      () => view?.getHistoryState?.(),
    ),
  );
  return extensions;
}

onMount(() => {
  if (!editorContainer) return;

  const safeSelection = {
    anchor: Math.min(initialSelection.anchor, initialContent.length),
    head: Math.min(initialSelection.head, initialContent.length),
  };

  const viewInstance = new EditorView({
    state: EditorState.create({
      doc: initialContent,
      extensions: createExtensions(initialHistoryState),
      selection: safeSelection,
    }),
    parent: editorContainer,
  });

  const typedView = viewInstance as AppEditorView;
  typedView.getHistoryState = () => typedView.state.field(historyField, false);
  typedView._currentTabId = tabId;
  typedView.flushPendingContent = () => tabSync.flushPending(typedView, onContentChange, onHistoryUpdate);

  view = typedView;
  setActiveEditorView(view);

  scrollSync.registerEditor(
    viewInstance,
    onScrollChange
      ? {
          getTabId: () => tabId,
          isRestoring: () => tabSync.isRestoring,
          onScrollChange,
        }
      : undefined,
  );

  // Restore the scroll synchronously so the first painted frame of a
  // deep-scrolled document is already parsed and highlighted.
  restoreScrollByTopLine(viewInstance, initialTopLine, initialScrollTop);

  const cleanupModifier = setupModifierKeyHandler(viewInstance);
  const cleanupSelScroll = setupSelectionDragScroll(viewInstance);

  setupGutterObserver();

  if (searchState.findText) updateSearchEditor(viewInstance);

  viewInstance.focus();

  const onWindowFocus = () => {
    viewInstance.focus();
    window.removeEventListener('focus', onWindowFocus);
  };
  window.addEventListener('focus', onWindowFocus);

  return () => {
    window.removeEventListener('focus', onWindowFocus);
    tabSync.cleanup();
    gutterObserver?.disconnect();
    cleanupModifier();
    cleanupSelScroll();
    if (getActiveEditorView() === view) setActiveEditorView(undefined);
    const v = view;
    if (onHistoryUpdate && v?.getHistoryState) onHistoryUpdate(v.getHistoryState());
    if (v) v.destroy();
  };
});
</script>

<div
  role="none"
  tabindex="-1"
  class="bg-bg-main relative h-full w-full overflow-hidden"
  class:raw-mode={effectiveMarkdown && appContext.settings.viewMode === 'raw'}
  class:rendered-mode={effectiveMarkdown && appContext.settings.viewMode === 'rendered'}
  bind:this={editorContainer}
  onclick={() => view?.focus()}
></div>
