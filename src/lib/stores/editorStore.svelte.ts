/**
 * Editor Store - State Management Architecture
 *
 * This file uses three distinct state management patterns based on reactivity needs:
 *
 * 1. REACTIVE STATE ($state):
 *    - Use for: UI-related data that needs to trigger updates when changed
 *    - Stored in: `editorStore` object (tabs, sessionDirty, mruStack, etc.)
 *    - Pattern: Direct property access, Svelte automatically tracks dependencies
 *
 * 2. NON-REACTIVE CACHES (WeakMap/Map):
 *    - Use for: Complex objects that don't need UI reactivity OR cause proxy issues
 *    - Stored in: Module-level WeakMaps (indexed by tab ID strings)
 *    - Pattern: Manual get/set/delete with tab ID keys
 *    - Rationale: Prevents "Maximum call stack exceeded" errors from deep reactive proxies
 *                 on objects containing SvelteSet/SvelteMap (e.g., LineChangeTracker)
 *
 * 3. DERIVED STATE ($derived):
 *    - Use in: Components for computed values based on reactive state
 *    - Pattern: $derived.by(() => { ... }) or $derived(expression)
 *    - Not stored here, computed at component level
 *
 * WHY NOT WeakMap FOR ALL CACHES?
 * - WeakMap requires object keys, but we use string tab IDs
 * - We need explicit cleanup when tabs close (WeakMap auto-cleans only when key is GC'd)
 * - Map gives us more control over lifecycle
 *
 * WHEN TO ADD NEW STATE:
 * - UI needs updates? → Add to editorStore ($state)
 * - Complex internal object with Svelte reactivity types? → Use non-reactive cache (Map)
 * - Simple debouncing/timers? → Use local Map with cleanup
 */

import type { OperationId } from '$lib/config/textOperationsRegistry';
import { initializeTabLoadState } from '$lib/services/sessionPersistence';
import { CONFIG } from '$lib/utils/config';
import { formatTimestampForDisplay, getCurrentTimestamp } from '$lib/utils/date';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { clearRendererCache } from '$lib/utils/markdown';
import { countWords, fastCountWords } from '$lib/utils/textMetrics';
import { appState } from './appState.svelte';

export type EditorTab = {
    id: string;
    title: string;
    content: string;
    lastSavedContent: string;
    isDirty: boolean;
    path: string | null;
    scrollPercentage: number;
    scrollTop?: number;
    sizeBytes: number;
    wordCount: number;
    lineCount: number;
    widestColumn: number;
    cursor: { anchor: number; head: number };
    topLine?: number;
    created?: string;
    modified?: string;
    formattedTimestamp?: string;
    originalTitle?: string;
    isPinned?: boolean;
    customTitle?: string;
    lineEnding: 'LF' | 'CRLF';
    encoding: string;
    fileCheckFailed?: boolean;
    fileCheckPerformed?: boolean;
    preferredExtension?: 'md' | 'txt';
    contentChanged?: boolean;
    isPersisted?: boolean;
    contentLoaded?: boolean;
    wordCountStrategy?: 'accurate' | 'fast';
    wordCountPending?: boolean;
    forceSync?: number;
};

export type ClosedTab = {
    tab: EditorTab;
    index: number;
    historyState?: unknown;
};

/**
 * NON-REACTIVE CACHE: CodeMirror History States
 *
 * Why non-reactive?
 * - CodeMirror history states are large, complex objects
 * - Reactivity adds Proxy overhead with no benefit (history is accessed imperatively)
 * - Prevents unnecessary deep observation of CodeMirror's internal structures
 *
 * Lifecycle: Cleared when tab closes via closeTab()
 */
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const historyStateCache = new Map<string, unknown>();

/**
 * NON-REACTIVE CACHE: LineChangeTracker Instances
 *
 * Why non-reactive?
 * - LineChangeTracker contains SvelteSet which causes "Maximum call stack exceeded"
 *   when wrapped in Svelte 5's reactive Proxy
 * - Used for internal tracking, no UI components need to react to changes
 *
 * Lifecycle: Created in addTab(), removed in closeTab() via removeLineChangeTracker()
 */
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const lineChangeTrackerCache = new Map<string, LineChangeTracker>();

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

/**
 * REACTIVE STATE: Main Editor State
 *
 * This is the primary reactive store for editor-related UI state.
 * All properties here trigger Svelte 5 reactivity when modified.
 *
 * Properties:
 * - tabs: Array of open editor tabs (reactive - UI updates when tabs change)
 * - sessionDirty: Whether session has unsaved changes (reactive - UI shows indicators)
 * - mruStack: Most Recently Used tab order (reactive - affects tab navigation)
 * - closedTabsHistory: Recently closed tabs for reopening (reactive - affects UI menus)
 * - lastScrollSource: Tracks scroll sync direction (reactive - prevents circular sync)
 * - pendingTransform: Queued text operation (reactive - triggers editor transformations)
 */
export const editorStore = $state({
    tabs: [] as EditorTab[],
    sessionDirty: false,
    mruStack: [] as string[],
    closedTabsHistory: [] as ClosedTab[],
    lastScrollSource: null as 'editor' | 'preview' | null,
    pendingTransform: null as { tabId: string; op: OperationId; timestamp: number } | null,
});

/**
 * Generic helper to find and update a tab
 */
function updateTab(
    id: string,
    updater: (tab: EditorTab) => Partial<EditorTab> | void,
    markDirty: boolean = true,
): boolean {
    const index = editorStore.tabs.findIndex((t) => t.id === id);
    if (index === -1) return false;

    const tab = editorStore.tabs[index];
    const updates = updater(tab);

    if (updates) {
        editorStore.tabs[index] = { ...tab, ...updates };
    }

    if (markDirty) {
        editorStore.sessionDirty = true;
    }

    return true;
}

/**
 * NON-REACTIVE CACHE: Word Count Debounce Timeouts
 *
 * Why non-reactive?
 * - Stores setTimeout IDs for debouncing expensive word count calculations
 * - No UI needs to react to the timeout IDs themselves
 * - Prevents memory leaks by allowing explicit cleanup
 *
 * Lifecycle: Entry deleted after timeout fires or tab closes
 */
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const wordCountDebounceMap = new Map<string, number>();

function scheduleWordCountUpdate(tabId: string, content: string, sizeBytes: number) {
    const existing = wordCountDebounceMap.get(tabId);
    if (existing) clearTimeout(existing);

    const timeout = window.setTimeout(() => {
        const index = editorStore.tabs.findIndex((t) => t.id === tabId);
        if (index === -1) {
            wordCountDebounceMap.delete(tabId);
            return;
        }

        const tab = editorStore.tabs[index];

        // Cache strategy decision on first run or if size changed significantly
        if (!tab.wordCountStrategy) {
            tab.wordCountStrategy =
                sizeBytes < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES ? 'accurate' : 'fast';
        }

        const wordCount =
            tab.wordCountStrategy === 'accurate' ? countWords(content) : fastCountWords(content);

        editorStore.tabs[index] = {
            ...tab,
            wordCount,
            wordCountPending: false,
        };

        wordCountDebounceMap.delete(tabId);
    }, CONFIG.PERFORMANCE.WORD_COUNT_DEBOUNCE_MS);

    wordCountDebounceMap.set(tabId, timeout);
}
export function performTextTransform(operationId: OperationId) {
    const activeId = appState.activeTabId;

    if (activeId) {
        // Trigger reactive update
        editorStore.pendingTransform = {
            tabId: activeId,
            op: operationId,
            timestamp: Date.now(),
        };
    } else {
        console.error(`[EditorStore] No active tab ID`);
    }
}

export function addTab(title: string = '', content: string = '') {
    const id = crypto.randomUUID();
    const now = getCurrentTimestamp();

    let finalTitle = title;
    const finalContent = content;

    if (!title || title === 'Untitled' || title === '') {
        const newTabPattern = /New-(\d+)/;
        let maxNewNumber = 0;
        for (const tab of editorStore.tabs) {
            const currentTitle = tab.customTitle || tab.title || '';
            const match = currentTitle.match(newTabPattern);
            if (match) maxNewNumber = Math.max(maxNewNumber, parseInt(match[1]));
        }
        finalTitle = `New-${maxNewNumber + 1}`;
    }

    const normalizedContent = normalizeLineEndings(finalContent);
    const sizeBytes = new TextEncoder().encode(normalizedContent).length;

    let wordCount = 0;
    let lineCount = 1;
    let widestColumn = 0;

    if (normalizedContent.length > 0) {
        const lines = normalizedContent.split('\n');
        lineCount = lines.length;
        // Use reduce instead of Math.max(...spread) to avoid stack overflow with large files
        widestColumn = lines.reduce((max, line) => Math.max(max, line.length), 0);
        wordCount =
            sizeBytes < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES
                ? countWords(normalizedContent)
                : fastCountWords(normalizedContent);
    }

    const newTab: EditorTab = {
        id,
        title: finalTitle,
        originalTitle: finalTitle,
        content: normalizedContent,
        lastSavedContent: normalizedContent,
        isDirty: false,
        path: null,
        scrollPercentage: 0,
        sizeBytes,
        wordCount,
        lineCount,
        widestColumn,
        cursor: { anchor: 0, head: 0 },
        topLine: 1,
        created: now,
        modified: now,
        formattedTimestamp: formatTimestampForDisplay(now),
        lineEnding: 'LF',
        encoding: 'UTF-8',
        contentChanged: true,
        isPersisted: false,
        contentLoaded: true,
        wordCountStrategy:
            sizeBytes < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES ? 'accurate' : 'fast',
        wordCountPending: false,
    };

    // Initialize LineChangeTracker in non-reactive cache
    lineChangeTrackerCache.set(id, new LineChangeTracker());

    initializeTabLoadState(id, true);

    if (appState.newTabPosition === 'beginning') {
        editorStore.tabs.unshift(newTab);
    } else if (appState.newTabPosition === 'right' && appState.activeTabId) {
        const activeIndex = editorStore.tabs.findIndex((t) => t.id === appState.activeTabId);
        editorStore.tabs.splice(activeIndex + 1, 0, newTab);
    } else {
        editorStore.tabs.push(newTab);
    }

    pushToMru(id);
    editorStore.sessionDirty = true;
    return id;
}

/**
 * Get or create a LineChangeTracker for a tab (non-reactive to avoid proxy issues)
 */
export function getLineChangeTracker(id: string): LineChangeTracker {
    let tracker = lineChangeTrackerCache.get(id);
    if (!tracker) {
        tracker = new LineChangeTracker();
        lineChangeTrackerCache.set(id, tracker);
    }
    return tracker;
}

/**
 * Set a LineChangeTracker for a tab (used when restoring from session)
 */
export function setLineChangeTracker(id: string, tracker: LineChangeTracker): void {
    lineChangeTrackerCache.set(id, tracker);
}

/**
 * Remove a LineChangeTracker from cache (called when closing tabs)
 */
function removeLineChangeTracker(id: string): void {
    lineChangeTrackerCache.delete(id);
}

export function closeTab(id: string) {
    const index = editorStore.tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const tab = editorStore.tabs[index];

    if (tab.path || (tab.content && tab.content.trim().length > 0)) {
        const limit = CONFIG.EDITOR.CLOSED_TABS_HISTORY_LIMIT;

        // Preserve history state in the closed tab record
        const historyState = historyStateCache.get(id);

        const filteredHistory = editorStore.closedTabsHistory.filter(
            (entry) => entry.tab.id !== id && (tab.path === null || entry.tab.path !== tab.path),
        );

        const closedTab = { ...tab };
        closedTab.isPersisted = false;

        editorStore.closedTabsHistory = [
            { tab: closedTab, index, historyState },
            ...filteredHistory,
        ].slice(0, limit);
    }

    editorStore.tabs = editorStore.tabs.filter((t) => t.id !== id);
    editorStore.mruStack = editorStore.mruStack.filter((tId) => tId !== id);

    historyStateCache.delete(id);

    removeLineChangeTracker(id);

    editorStore.sessionDirty = true;
    clearRendererCache(id);
}

export function reopenLastClosed() {
    if (editorStore.closedTabsHistory.length > 0) {
        reopenClosedTab(0);
    }
}

export function reopenClosedTab(historyIndex: number): string | null {
    if (historyIndex < 0 || historyIndex >= editorStore.closedTabsHistory.length) return null;

    const entry = editorStore.closedTabsHistory[historyIndex];
    editorStore.closedTabsHistory.splice(historyIndex, 1);

    entry.tab.contentChanged = true;
    entry.tab.isPersisted = false;
    if (entry.tab.contentLoaded === false) {
        entry.tab.contentLoaded = false;
    }

    // Restore history state
    if (entry.historyState) {
        historyStateCache.set(entry.tab.id, entry.historyState);
    }

    const insertIndex = Math.min(entry.index, editorStore.tabs.length);
    editorStore.tabs.splice(insertIndex, 0, entry.tab);

    pushToMru(entry.tab.id);

    // Focus the reopened tab
    appState.activeTabId = entry.tab.id;

    editorStore.sessionDirty = true;
    return entry.tab.id;
}

export function pushToMru(id: string) {
    if (editorStore.mruStack.length > 0 && editorStore.mruStack[0] === id) return;
    editorStore.mruStack = [id, ...editorStore.mruStack.filter((tId) => tId !== id)];
    editorStore.sessionDirty = true;
}

export function reorderTabs(newTabs: EditorTab[]) {
    editorStore.tabs = newTabs;
    editorStore.sessionDirty = true;
}

export function updateContent(id: string, content: string) {
    const index = editorStore.tabs.findIndex((t) => t.id === id);
    if (index === -1) {
        console.warn('[EditorStore] updateContent: tab not found:', id);
        return;
    }

    const oldTab = editorStore.tabs[index];
    if (oldTab.content === content) return;

    let newTitle = oldTab.title;
    if (appState.tabNameFromContent) {
        const trimmed = content.trim();
        if (trimmed.length > 0) {
            const lines = content.split('\n');
            const firstLine = lines.find((l) => l.trim().length > 0) || '';
            let smartTitle = firstLine.replace(/^#+\s*/, '').trim();
            const MAX_LEN = 25;
            if (smartTitle.length > MAX_LEN) {
                smartTitle = smartTitle.substring(0, MAX_LEN).trim() + '...';
            }
            if (smartTitle.length > 0) {
                newTitle = smartTitle;
            } else if (oldTab.originalTitle) {
                newTitle = oldTab.originalTitle;
            }
        } else if (oldTab.originalTitle) {
            newTitle = oldTab.originalTitle;
        }
    }

    const now = getCurrentTimestamp();

    // FAST metrics - calculated instantly on every keystroke
    const sizeBytes = new TextEncoder().encode(content).length;
    const lineCount = (content.match(/\n/g) || []).length + 1;

    // DEBOUNCED metrics - expensive, calculated after 500ms delay
    scheduleWordCountUpdate(id, content, sizeBytes);

    const updatedTab = {
        ...oldTab,
        title: newTitle,
        content,
        isDirty: content !== oldTab.lastSavedContent,
        modified: now,
        formattedTimestamp: formatTimestampForDisplay(now),
        sizeBytes,
        lineCount,
        // Keep old wordCount until debounced update completes
        wordCountPending: true,
        contentChanged: true,
    };

    editorStore.tabs[index] = updatedTab;
    editorStore.sessionDirty = true;
}

export function updateScroll(
    id: string,
    percentage: number,
    scrollTop: number,
    topLine: number | undefined,
    source: 'editor' | 'preview',
) {
    const index = editorStore.tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const tab = editorStore.tabs[index];
    const isSignificant =
        Math.abs(tab.scrollPercentage - percentage) > 0.001 ||
        Math.abs((tab.scrollTop || 0) - scrollTop) > 0.5 ||
        (topLine !== undefined && Math.abs((tab.topLine || 0) - topLine) > 0.01);

    if (isSignificant) {
        editorStore.lastScrollSource = source;
        tab.scrollPercentage = percentage;
        tab.scrollTop = scrollTop;
        if (topLine !== undefined) tab.topLine = topLine;
        editorStore.sessionDirty = true;
    }
}

export function updateCursor(id: string, anchor: number, head: number) {
    updateTab(
        id,
        (tab) => {
            if (tab.cursor.anchor !== anchor || tab.cursor.head !== head) {
                return { cursor: { anchor, head } };
            }
        },
        false,
    );
}

export function updateMetadata(id: string, created?: string, modified?: string) {
    updateTab(id, (tab) => {
        if (tab.created !== created || tab.modified !== modified) {
            const tsToFormat = modified || tab.modified || created || tab.created || '';
            return {
                created: created || tab.created,
                modified: modified || tab.modified,
                formattedTimestamp: formatTimestampForDisplay(tsToFormat),
            };
        }
    });
}

export function updateHistoryState(id: string, state: unknown) {
    // Store in Map to avoid Proxy performance overhead on large history objects
    historyStateCache.set(id, state);
}

export function getHistoryState(id: string): unknown | undefined {
    return historyStateCache.get(id);
}

export function markAsSaved(id: string) {
    updateTab(id, (tab) => ({
        lastSavedContent: tab.content,
        isDirty: false,
    }));
}

export function togglePin(id: string) {
    updateTab(id, (tab) => ({ isPinned: !tab.isPinned }));
}

export function updateTabTitle(id: string, title: string, customTitle?: string) {
    updateTab(id, () => {
        const updates: Partial<EditorTab> = { title };
        if (customTitle !== undefined) {
            updates.customTitle = customTitle;
        }
        return updates;
    });
}

export function updateTabPath(id: string, path: string, title?: string) {
    updateTab(id, () => {
        const updates: Partial<EditorTab> = { path };
        if (title !== undefined) {
            updates.title = title;
        }
        return updates;
    });
}

export function updateTabMetadataAndPath(id: string, updates: Partial<EditorTab>) {
    updateTab(id, () => updates);
}

export function setFileCheckStatus(id: string, performed: boolean, failed: boolean) {
    updateTab(id, () => ({
        fileCheckPerformed: performed,
        fileCheckFailed: failed,
    }));
}

export function reloadTabContent(
    id: string,
    content: string,
    lineEnding: 'LF' | 'CRLF',
    encoding: string,
    sizeBytes: number,
) {
    const lineArray = content.split('\n');
    const lineCount = lineArray.length;
    // Use reduce instead of Math.max(...spread) to avoid stack overflow with large files
    const widestColumn = lineArray.reduce((max, line) => Math.max(max, line.length), 0);

    const wordCountStrategy: 'accurate' | 'fast' =
        sizeBytes < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES ? 'accurate' : 'fast';
    const wordCount =
        wordCountStrategy === 'accurate' ? countWords(content) : fastCountWords(content);

    updateTab(id, (tab) => ({
        content,
        lastSavedContent: content,
        isDirty: false,
        lineEnding,
        encoding,
        sizeBytes,
        wordCount,
        lineCount,
        widestColumn,
        wordCountStrategy,
        wordCountPending: false,
        fileCheckPerformed: false,
        contentChanged: true,
        forceSync: (tab.forceSync ?? 0) + 1,
    }));
}

export function updateContentOnly(id: string, content: string, forceSync: boolean = false) {
    updateTab(id, (tab) => ({
        content,
        contentChanged: true,
        forceSync: forceSync ? (tab.forceSync ?? 0) + 1 : tab.forceSync,
    }));
}

export function updateLineEnding(id: string, lineEnding: 'LF' | 'CRLF') {
    updateTab(id, () => ({ lineEnding }));
}

export function saveTabComplete(
    id: string,
    path: string,
    title: string,
    lineEnding: 'LF' | 'CRLF',
) {
    updateTab(id, () => ({
        path,
        title,
        lineEnding,
        fileCheckPerformed: false,
        fileCheckFailed: false,
    }));
}

export function togglePreferredExtension(id: string) {
    updateTab(id, (tab) => {
        let current = tab.preferredExtension;
        if (!current) {
            if (tab.path) {
                current = isMarkdownFile(tab.path) ? 'md' : 'txt';
            } else {
                current = 'md';
            }
        }
        return { preferredExtension: current === 'md' ? 'txt' : 'md' };
    });
}

export function markTabPersisted(id: string) {
    updateTab(
        id,
        () => ({
            contentChanged: false,
            isPersisted: true,
        }),
        false,
    );
}
