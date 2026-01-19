import type { OperationId } from '$lib/config/textOperationsRegistry';
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
    lineChangeTracker?: LineChangeTracker;
    preferredExtension?: 'md' | 'txt';
    contentChanged?: boolean;
    isPersisted?: boolean;
    contentLoaded?: boolean;
    forceSync?: number;
};

export type ClosedTab = {
    tab: EditorTab;
    index: number;
    historyState?: unknown;
};

// Non-reactive storage for CodeMirror history states to avoid Proxy performance costs
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const historyStateCache = new Map<string, unknown>();

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

// Replaced callback registry with reactive state pattern
export const editorStore = $state({
    tabs: [] as EditorTab[],
    sessionDirty: false,
    mruStack: [] as string[],
    closedTabsHistory: [] as ClosedTab[],
    lastScrollSource: null as 'editor' | 'preview' | null,
    // New: Reactive command state
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
        widestColumn = Math.max(...lines.map((l) => l.length));
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
        lineChangeTracker: new LineChangeTracker(),
    };

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

        editorStore.closedTabsHistory = [
            { tab: { ...tab }, index, historyState },
            ...filteredHistory,
        ].slice(0, limit);
    }

    editorStore.tabs = editorStore.tabs.filter((t) => t.id !== id);
    editorStore.mruStack = editorStore.mruStack.filter((tId) => tId !== id);

    // Clean up history cache
    historyStateCache.delete(id);

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
    const sizeBytes = new TextEncoder().encode(content).length;

    // Performance optimization: Avoid repeated splits and heavy regex on keystroke
    const lineArray = content.split('\n');
    const lineCount = lineArray.length;
    const widestColumn = Math.max(...lineArray.map((l) => l.length));

    const wordCount =
        sizeBytes < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES
            ? countWords(content)
            : fastCountWords(content);

    const updatedTab = {
        ...oldTab,
        title: newTitle,
        content,
        isDirty: content !== oldTab.lastSavedContent,
        modified: now,
        formattedTimestamp: formatTimestampForDisplay(now),
        sizeBytes,
        wordCount,
        lineCount,
        widestColumn,
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
    const widestColumn = Math.max(...lineArray.map((l) => l.length));

    const wordCount =
        sizeBytes < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES
            ? countWords(content)
            : fastCountWords(content);

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
