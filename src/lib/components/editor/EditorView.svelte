<script lang="ts">
import { history, historyField } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { Compartment, EditorState, type Extension, type StateEffect } from '@codemirror/state';
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
import { getActiveEditorView, setActiveEditorView } from '$lib/utils/editorCommands';
import { newlinePlugin, selectionWhitespacePlugin } from '$lib/utils/editorPlugins';
import { generateDynamicTheme } from '$lib/utils/editorTheme';
import { linkPlugin, linkTheme } from '$lib/utils/filePathExtension';
import type { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { createMarkdownLinter } from '$lib/utils/markdownLintExtension.svelte.ts';
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
    filePathComp: new Compartment(), markdownLintComp: new Compartment(),
};

let autocompletionConfig = $derived(getAutocompletionConfig());

$effect(() => { cmView = view; });

let prevSnap: Record<string, unknown> | undefined;
$effect(() => {
    if (!view) return;

    const theme = appContext.app.theme, fontSize = appContext.app.editorFontSize;
    const fontFamily = appContext.app.editorFontFamily, insertMode = appContext.metrics.insertMode;
    const undoDepth = appContext.app.undoDepth, indent = appContext.app.defaultIndent;
    const showWs = appContext.app.showWhitespace, dc = appContext.app.doubleClickSelectsTrailingSpace;
    const ww = appContext.app.editorWordWrap, wg = appContext.app.wrapGuideColumn;
    const rcc = appContext.app.recentChangesCount, rcts = appContext.app.recentChangesTimespan;
    const lct = lineChangeTracker;
    const customDict = spellcheckState.customDictionary, dictSize = customDict.size;
    const dictLoaded = spellcheckState.dictionaryLoaded;
    const autoCfg = autocompletionConfig, md = isMarkdown, handlers = eventHandlers;

    const prev = untrack(() => prevSnap);
    if (prev
        && prev.theme === theme && prev.fontSize === fontSize
        && prev.fontFamily === fontFamily && prev.insertMode === insertMode
        && prev.undoDepth === undoDepth && prev.indent === indent
        && prev.showWs === showWs && prev.dc === dc
        && prev.ww === ww && prev.wg === wg
        && prev.rcc === rcc && prev.rcts === rcts && prev.lct === lct
        && prev.dictLoaded === dictLoaded && prev.customDict === customDict && prev.dictSize === dictSize
        && prev.autoCfg === autoCfg && prev.md === md && prev.handlers === handlers
    ) return;

    prevSnap = {
        theme, fontSize, fontFamily, insertMode, undoDepth, indent,
        showWs, dc, ww, wg, rcc, rcts, lct, dictLoaded, customDict, dictSize,
        autoCfg, md, handlers,
    };

    const effects: StateEffect<unknown>[] = [];

    if (!prev || theme !== prev.theme || fontSize !== prev.fontSize || fontFamily !== prev.fontFamily || insertMode !== prev.insertMode) {
        effects.push(comps.themeComp.reconfigure(generateDynamicTheme(fontSize, fontFamily, theme === 'dark', insertMode)));
    }
    if (!prev || undoDepth !== prev.undoDepth) {
        effects.push(comps.historyComp.reconfigure(history({ minDepth: undoDepth })));
    }
    if (!prev || indent !== prev.indent) {
        effects.push(comps.indentComp.reconfigure(indentUnit.of(' '.repeat(Math.max(1, indent)))));
    }
    if (!prev || showWs !== prev.showWs) {
        effects.push(comps.whitespaceComp.reconfigure(showWs ? [highlightWhitespace(), newlinePlugin] : [selectionWhitespacePlugin]));
    }
    if (!prev || dc !== prev.dc) {
        effects.push(comps.doubleClickComp.reconfigure(createDoubleClickHandler()));
    }
    if (!prev || ww !== prev.ww || wg !== prev.wg) {
        effects.push(comps.wrapComp.reconfigure(createWrapExtension()));
    }
    if (!prev || rcc !== prev.rcc || rcts !== prev.rcts || lct !== prev.lct) {
        effects.push(comps.recentComp.reconfigure(createRecentChangesHighlighter(lct)));
    }
    if (dictLoaded && (!prev?.dictLoaded || customDict !== prev.customDict || dictSize !== prev.dictSize)) {
        effects.push(comps.spellComp.reconfigure(createSpellCheckLinter()));
    }
    if (!prev || md !== prev.md) {
        effects.push(comps.languageComp.reconfigure(md ? markdownExtensions : []));
        effects.push(comps.filePathComp.reconfigure(md ? [linkPlugin, linkTheme] : []));
        effects.push(comps.markdownLintComp.reconfigure(md ? createMarkdownLinter() : []));
    }
    if (!prev || autoCfg !== prev.autoCfg) {
        effects.push(comps.autoComp.reconfigure(autoCfg));
    }
    if (!prev || handlers !== prev.handlers) {
        effects.push(comps.handlersComp.reconfigure(handlers));
    }

    if (effects.length > 0) {
        view.dispatch({ effects });
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
    setActiveEditorView(view);

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
    bind:this={editorContainer}
    onclick={() => view?.focus()}></div>
