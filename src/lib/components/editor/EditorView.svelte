<script lang="ts">
import { history, historyField } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightWhitespace, type KeyBinding } from '@codemirror/view';
import { onMount, untrack } from 'svelte';
import { createDoubleClickHandler, createWrapExtension, getAutocompletionConfig } from '$lib/components/editor/codemirror/config';
import { type Compartments, createBaseExtensions, markdownExtensions } from '$lib/components/editor/logic/extensions';
import { setupModifierKeyHandler } from '$lib/components/editor/logic/modifierKeys';
import { setupScrollSync } from '$lib/components/editor/logic/scrollSync';
import { setupSelectionDragScroll } from '$lib/components/editor/logic/selectionScroll';
import { TabSyncManager } from '$lib/components/editor/logic/tabSync';
import { createUpdateListener } from '$lib/components/editor/logic/updateListener';
import type { EditorMetrics } from '$lib/stores/editorMetrics.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { ScrollManager } from '$lib/utils/cmScroll';
import { newlinePlugin, selectionWhitespacePlugin } from '$lib/utils/editorPlugins';
import { generateDynamicTheme } from '$lib/utils/editorTheme';
import { linkPlugin, linkTheme } from '$lib/utils/filePathExtension';
import type { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { createRecentChangesHighlighter } from '$lib/utils/recentChangesExtension';
import { scrollSync } from '$lib/utils/scrollSync.svelte.ts';
import { searchState, updateSearchEditor } from '$lib/utils/searchManager.svelte.ts';
import { spellcheckState } from '$lib/utils/spellcheck.svelte.ts';
import { createSpellCheckLinter } from '$lib/utils/spellcheckExtension.svelte.ts';
import type { AppEditorView } from '../../../global';

let {
    tabId,
    initialContent = '',
    isMarkdown = true,
    initialScrollTop = 0,
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
    cmView = $bindable(),
} = $props<{
    tabId: string;
    initialContent?: string;
    isMarkdown?: boolean;
    initialScrollTop?: number;
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
    cmView?: AppEditorView;
}>();

let editorContainer = $state<HTMLDivElement>();
let view = $state<AppEditorView>();

let scrollManager = new ScrollManager();
let tabSync = new TabSyncManager(scrollManager);

let comps: Compartments = {
    wrapComp: new Compartment(), autoComp: new Compartment(),
    recentComp: new Compartment(), historyComp: new Compartment(),
    themeComp: new Compartment(), indentComp: new Compartment(),
    spellComp: new Compartment(), whitespaceComp: new Compartment(),
    languageComp: new Compartment(), handlersComp: new Compartment(),
    doubleClickComp: new Compartment(), rulerComp: new Compartment(),
    filePathComp: new Compartment(),
};

let autocompletionConfig = $derived(getAutocompletionConfig());

$effect(() => { cmView = view; });

$effect(() => {
    void spellcheckState.customDictionary;
    if (view && spellcheckState.dictionaryLoaded) {
        view.dispatch({ effects: comps.spellComp.reconfigure(createSpellCheckLinter()) });
    }
});

let prevIsMd = untrack(() => isMarkdown);
$effect(() => {
    if (view && isMarkdown !== prevIsMd) {
        prevIsMd = isMarkdown;
        view.dispatch({
            effects: [
                comps.languageComp.reconfigure(isMarkdown ? markdownExtensions : []),
                comps.filePathComp.reconfigure(isMarkdown ? [linkPlugin, linkTheme] : []),
            ],
        });
    }
});

let prevAuto = untrack(() => autocompletionConfig);
$effect(() => {
    if (view && autocompletionConfig !== prevAuto) {
        prevAuto = autocompletionConfig;
        view.dispatch({ effects: comps.autoComp.reconfigure(autocompletionConfig) });
    }
});

let prevThemeCfg = untrack(() => ({
    theme: appContext.app.theme, fontSize: appContext.app.editorFontSize,
    fontFamily: appContext.app.editorFontFamily, insertMode: appContext.metrics.insertMode,
}));
$effect(() => {
    const t = appContext.app.theme, fs = appContext.app.editorFontSize;
    const ff = appContext.app.editorFontFamily, im = appContext.metrics.insertMode;
    if (view && (t !== prevThemeCfg.theme || fs !== prevThemeCfg.fontSize || ff !== prevThemeCfg.fontFamily || im !== prevThemeCfg.insertMode)) {
        prevThemeCfg = { theme: t, fontSize: fs, fontFamily: ff, insertMode: im };
        view.dispatch({ effects: comps.themeComp.reconfigure(generateDynamicTheme(fs, ff, t === 'dark', im)) });
    }
});

let prevUndo = appContext.app.undoDepth;
$effect(() => {
    if (view && appContext.app.undoDepth !== prevUndo) {
        prevUndo = appContext.app.undoDepth;
        view.dispatch({ effects: comps.historyComp.reconfigure(history({ minDepth: appContext.app.undoDepth })) });
    }
});

let prevIndent = appContext.app.defaultIndent;
$effect(() => {
    if (view && appContext.app.defaultIndent !== prevIndent) {
        prevIndent = appContext.app.defaultIndent;
        view.dispatch({ effects: comps.indentComp.reconfigure(indentUnit.of(' '.repeat(Math.max(1, appContext.app.defaultIndent)))) });
    }
});

let prevWs = appContext.app.showWhitespace;
$effect(() => {
    if (view && appContext.app.showWhitespace !== prevWs) {
        prevWs = appContext.app.showWhitespace;
        view.dispatch({
            effects: comps.whitespaceComp.reconfigure(
                appContext.app.showWhitespace ? [highlightWhitespace(), newlinePlugin] : [selectionWhitespacePlugin],
            ),
        });
    }
});

let prevDc = appContext.app.doubleClickSelectsTrailingSpace;
$effect(() => {
    if (view && appContext.app.doubleClickSelectsTrailingSpace !== prevDc) {
        prevDc = appContext.app.doubleClickSelectsTrailingSpace;
        view.dispatch({ effects: comps.doubleClickComp.reconfigure(createDoubleClickHandler()) });
    }
});

let prevWw = untrack(() => ({ ww: appContext.app.editorWordWrap, wg: appContext.app.wrapGuideColumn }));
$effect(() => {
    const ww = appContext.app.editorWordWrap, wg = appContext.app.wrapGuideColumn;
    if (view && (ww !== prevWw.ww || wg !== prevWw.wg)) {
        prevWw = { ww, wg };
        view.dispatch({ effects: comps.wrapComp.reconfigure(createWrapExtension()) });
    }
});

let prevHandlers = untrack(() => eventHandlers);
$effect(() => {
    if (view && eventHandlers !== prevHandlers) {
        prevHandlers = eventHandlers;
        view.dispatch({ effects: comps.handlersComp.reconfigure(eventHandlers) });
    }
});

let prevRecent = untrack(() => ({ lct: lineChangeTracker, rcc: appContext.app.recentChangesCount, rcts: appContext.app.recentChangesTimespan }));
$effect(() => {
    const lct = lineChangeTracker, rcc = appContext.app.recentChangesCount, rcts = appContext.app.recentChangesTimespan;
    if (view && (lct !== prevRecent.lct || rcc !== prevRecent.rcc || rcts !== prevRecent.rcts)) {
        prevRecent = { lct, rcc, rcts };
        view.dispatch({ effects: comps.recentComp.reconfigure(createRecentChangesHighlighter(lct)) });
    }
});

function createExtensions(currentHistoryState: unknown): Extension[] {
    const extensions = createBaseExtensions({ currentHistoryState, lineChangeTracker, autocompletionConfig, isMarkdown, customKeymap, eventHandlers, compartments: comps });
    extensions.push(createUpdateListener(
        () => view?._currentTabId,
        onContentChange, onMetricsChange, tabSync.timerRefs,
        onSelectionChange, onHistoryUpdate,
        () => view?.getHistoryState?.(),
    ));
    return extensions;
}

$effect(() => {
    const tId = tabId;
    const forceSyncCounter = appContext.editor.tabs.find((t) => t.id === tId)?.forceSync ?? 0;
    untrack(() => {
        if (!view) return;
        tabSync.process(view, tId, forceSyncCounter, createExtensions, onMetricsChange);
    });
});

onMount(() => {
    if (!editorContainer) return;

    const safeSelection = {
        anchor: Math.min(initialSelection.anchor, initialContent.length),
        head: Math.min(initialSelection.head, initialContent.length),
    };

    const viewInstance = new EditorView({
        state: EditorState.create({ doc: initialContent, extensions: createExtensions(initialHistoryState), selection: safeSelection }),
        parent: editorContainer,
    });

    const typedView = viewInstance as AppEditorView;
    typedView.getHistoryState = () => typedView.state.field(historyField, false);
    typedView._currentTabId = tabId;
    typedView.flushPendingContent = () => tabSync.flushPending(typedView, onContentChange, onHistoryUpdate);

    view = typedView;
    window._activeEditorView = view;

    scrollSync.registerEditor(viewInstance);

    viewInstance.requestMeasure({
        read: () => {},
        write: () => { viewInstance.scrollDOM.scrollTop = initialScrollTop; },
    });

    const cleanupModifier = setupModifierKeyHandler(viewInstance);
    const cleanupScroll = setupScrollSync(viewInstance, tabId, () => tabSync.isRestoring, onScrollChange);
    const cleanupSelScroll = setupSelectionDragScroll(viewInstance);

    if (searchState.findText) updateSearchEditor(viewInstance);

    viewInstance.focus();

    const onWindowFocus = () => { viewInstance.focus(); window.removeEventListener('focus', onWindowFocus); };
    window.addEventListener('focus', onWindowFocus);

    return () => {
        window.removeEventListener('focus', onWindowFocus);
        tabSync.cleanup();
        cleanupModifier();
        cleanupScroll();
        cleanupSelScroll();
        if (window._activeEditorView === view) window._activeEditorView = undefined;
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
    bind:this={editorContainer}
    onclick={() => view?.focus()}></div>
