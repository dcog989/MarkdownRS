import type { OperationId } from "$lib/config/textOperationsRegistry";
import { CONFIG } from "$lib/utils/config";
import { formatTimestampForDisplay, getCurrentTimestamp } from "$lib/utils/date";
import { isMarkdownFile } from "$lib/utils/fileValidation";
import type { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
import { clearRendererCache } from "$lib/utils/markdown";
import { appState } from "./appState.svelte";

export type EditorTab = {
    id: string;
    title: string;
    content: string;
    lastSavedContent: string;
    isDirty: boolean;
    path: string | null;
    scrollPercentage: number;
    sizeBytes: number;
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
    historyState?: any;
    preferredExtension?: 'md' | 'txt';
    // Persistence optimization flags
    contentChanged?: boolean; // Content has changed since last DB persist
    isPersisted?: boolean;    // Tab exists in DB
    contentLoaded?: boolean;  // Content has been loaded from DB (for lazy loading)
};

export type ClosedTab = {
    tab: EditorTab;
    index: number;
};

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

type TextOperationCallback = (operationId: OperationId) => void;

let textOperationCallback: TextOperationCallback | null = null;

export const editorStore = $state({
    tabs: [] as EditorTab[],
    sessionDirty: false,
    mruStack: [] as string[],
    closedTabsHistory: [] as ClosedTab[],
    lastScrollSource: null as 'editor' | 'preview' | null,
});

/**
 * Generic helper to find and update a tab
 * @param id - Tab ID to find
 * @param updater - Function that receives the tab and returns updated properties or void
 * @param markDirty - Whether to mark session as dirty (default: true)
 * @returns true if tab was found and updated, false otherwise
 */
function updateTab(
    id: string,
    updater: (tab: EditorTab) => Partial<EditorTab> | void,
    markDirty: boolean = true
): boolean {
    const index = editorStore.tabs.findIndex(t => t.id === id);
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

export function registerTextOperationCallback(callback: TextOperationCallback) {
    textOperationCallback = callback;
}

export function unregisterTextOperationCallback() {
    textOperationCallback = null;
}

export function addTab(title: string = '', content: string = '') {
    const id = crypto.randomUUID();
    const now = getCurrentTimestamp();

    let finalTitle = title;
    let finalContent = content;

    if (!title || title === 'Untitled' || title === '') {
        const newTabPattern = /New-(\d+)/;
        let maxNewNumber = 0;
        for (const tab of editorStore.tabs) {
            const currentTitle = tab.customTitle || tab.title || "";
            const match = currentTitle.match(newTabPattern);
            if (match) maxNewNumber = Math.max(maxNewNumber, parseInt(match[1]));
        }
        finalTitle = `New-${maxNewNumber + 1}`;
    }

    const normalizedContent = normalizeLineEndings(finalContent);
    const sizeBytes = new TextEncoder().encode(normalizedContent).length;

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
        cursor: { anchor: 0, head: 0 },
        topLine: 1,
        created: now,
        modified: now,
        formattedTimestamp: formatTimestampForDisplay(now),
        lineEnding: 'LF',
        encoding: 'UTF-8',
        contentChanged: true, // New tab needs content saved
        isPersisted: false,   // New tab not yet in DB
        contentLoaded: true,  // New tab's content is already in memory
    };

    if (appState.newTabPosition === 'beginning') {
        editorStore.tabs.unshift(newTab);
    } else if (appState.newTabPosition === 'right' && appState.activeTabId) {
        const activeIndex = editorStore.tabs.findIndex(t => t.id === appState.activeTabId);
        editorStore.tabs.splice(activeIndex + 1, 0, newTab);
    } else {
        editorStore.tabs.push(newTab);
    }

    pushToMru(id);
    editorStore.sessionDirty = true;
    return id;
}

export function closeTab(id: string) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index !== -1) {
        const tab = editorStore.tabs[index];
        if (tab.path || tab.content.trim().length > 0) {
            const limit = CONFIG.EDITOR.CLOSED_TABS_HISTORY_LIMIT;

            let filteredHistory = editorStore.closedTabsHistory;
            // Prevent duplicate file entries in history
            if (tab.path) {
                filteredHistory = filteredHistory.filter(entry => entry.tab.path !== tab.path);
            }

            editorStore.closedTabsHistory = [{ tab: { ...tab }, index }, ...filteredHistory].slice(0, limit);
        }
        editorStore.tabs.splice(index, 1);
        editorStore.mruStack = editorStore.mruStack.filter(tId => tId !== id);
        editorStore.sessionDirty = true;
        clearRendererCache(id);
    }
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

    // Reopened tab needs full persistence
    entry.tab.contentChanged = true;
    entry.tab.isPersisted = false;
    // Content is already loaded since it's in closedTabsHistory
    // But mark it as needing verification
    if (entry.tab.contentLoaded === false) {
        entry.tab.contentLoaded = false;
    }

    const insertIndex = Math.min(entry.index, editorStore.tabs.length);
    editorStore.tabs.splice(insertIndex, 0, entry.tab);

    pushToMru(entry.tab.id);
    editorStore.sessionDirty = true;
    return entry.tab.id;
}

export function pushToMru(id: string) {
    if (editorStore.mruStack.length > 0 && editorStore.mruStack[0] === id) return;
    editorStore.mruStack = [id, ...editorStore.mruStack.filter(tId => tId !== id)];
    editorStore.sessionDirty = true;
}

export function reorderTabs(newTabs: EditorTab[]) {
    editorStore.tabs = newTabs;
    editorStore.sessionDirty = true;
}

export function updateContent(id: string, content: string) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    const oldTab = editorStore.tabs[index];
    if (oldTab.content === content) return;

    let newTitle = oldTab.title;
    if (appState.tabNameFromContent) {
        const trimmed = content.trim();
        if (trimmed.length > 0) {
            const lines = content.split('\n');
            const firstLine = lines.find(l => l.trim().length > 0) || "";
            let smartTitle = firstLine.replace(/^#+\s*/, "").trim();
            const MAX_LEN = 25;
            if (smartTitle.length > MAX_LEN) {
                smartTitle = smartTitle.substring(0, MAX_LEN).trim() + "...";
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
    const updatedTab = {
        ...oldTab,
        title: newTitle,
        content,
        isDirty: content !== oldTab.lastSavedContent,
        modified: now,
        formattedTimestamp: formatTimestampForDisplay(now),
        sizeBytes: new TextEncoder().encode(content).length,
        contentChanged: true // Mark for persistence
    };

    editorStore.tabs[index] = updatedTab;
    editorStore.sessionDirty = true;
}

export function updateScroll(id: string, percentage: number, topLine: number | undefined, source: 'editor' | 'preview') {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    const tab = editorStore.tabs[index];
    const isSignificant = Math.abs(tab.scrollPercentage - percentage) > 0.001 ||
        (topLine !== undefined && Math.abs((tab.topLine || 0) - topLine) > 0.01);

    if (isSignificant) {
        editorStore.lastScrollSource = source;
        tab.scrollPercentage = percentage;
        if (topLine !== undefined) tab.topLine = topLine;
        editorStore.sessionDirty = true;
    }
}

export function updateCursor(id: string, anchor: number, head: number) {
    updateTab(id, (tab) => {
        if (tab.cursor.anchor !== anchor || tab.cursor.head !== head) {
            return { cursor: { anchor, head } };
        }
    }, false);
}

export function updateMetadata(id: string, created?: string, modified?: string) {
    updateTab(id, (tab) => {
        if (tab.created !== created || tab.modified !== modified) {
            const tsToFormat = modified || tab.modified || created || tab.created || "";
            return {
                created: created || tab.created,
                modified: modified || tab.modified,
                formattedTimestamp: formatTimestampForDisplay(tsToFormat)
            };
        }
    });
}

export function updateHistoryState(id: string, state: any) {
    updateTab(id, () => ({ historyState: state }), false);
}

export function markAsSaved(id: string) {
    updateTab(id, (tab) => ({
        lastSavedContent: tab.content,
        isDirty: false
    }));
}

export function performTextTransform(operationId: OperationId) {
    if (textOperationCallback) textOperationCallback(operationId);
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
        fileCheckFailed: failed
    }));
}

export function reloadTabContent(id: string, content: string, lineEnding: 'LF' | 'CRLF', encoding: string, sizeBytes: number) {
    updateTab(id, () => ({
        content,
        lastSavedContent: content,
        isDirty: false,
        lineEnding,
        encoding,
        sizeBytes,
        fileCheckPerformed: false,
        contentChanged: true // Reload means new content to persist
    }));
}

export function updateContentOnly(id: string, content: string) {
    updateTab(id, () => ({ content, contentChanged: true }));
}

export function updateLineEnding(id: string, lineEnding: 'LF' | 'CRLF') {
    updateTab(id, () => ({ lineEnding }));
}

export function saveTabComplete(id: string, path: string, title: string, lineEnding: 'LF' | 'CRLF') {
    updateTab(id, () => ({
        path,
        title,
        lineEnding,
        fileCheckPerformed: false,
        fileCheckFailed: false
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
    updateTab(id, () => ({ contentChanged: false, isPersisted: true }), false);
}
