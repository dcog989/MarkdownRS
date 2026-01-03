import type { OperationId } from "$lib/config/textOperationsRegistry";
import { formatTimestampForDisplay, getCurrentTimestamp } from "$lib/utils/date";
import { isMarkdownFile } from "$lib/utils/fileValidation";
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
    lineChangeTracker?: any; // Store LineChangeTracker instance per tab
    preferredExtension?: 'md' | 'txt'; // For unsaved files: user's preference
};

export type ClosedTab = {
    tab: EditorTab;
    index: number;
};

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

type TextOperationCallback = (operationId: OperationId) => void;

// Module-level private state
let textOperationCallback: TextOperationCallback | null = null;

// Public reactive state
// Using $state (not .raw) to ensure array mutations (push, splice) trigger updates
export const editorStore = $state({
    tabs: [] as EditorTab[],
    sessionDirty: false,
    mruStack: [] as string[],
    closedTabsHistory: [] as ClosedTab[],
    lastScrollSource: null as 'editor' | 'preview' | null,
});


// Logic Functions
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
        // Don't pre-fill content for new tabs - keep it empty
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
        encoding: 'UTF-8'
        // preferredExtension is intentionally undefined to allow file extension detection
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
        // Store up to 12 recently closed tabs
        editorStore.closedTabsHistory = [{ tab: { ...tab }, index }, ...editorStore.closedTabsHistory.slice(0, 11)];
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

    if (!oldTab.path) {
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
        sizeBytes: new TextEncoder().encode(content).length
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
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    // Only update if changed to avoid unnecessary reactivity
    if (editorStore.tabs[index].cursor.anchor !== anchor || editorStore.tabs[index].cursor.head !== head) {
        editorStore.tabs[index].cursor = { anchor, head };
        // We generally don't mark sessionDirty for cursor changes to avoid heavy DB writes
        // Cursor position is currently transient in-memory
    }
}

export function updateMetadata(id: string, created?: string, modified?: string) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    const tab = editorStore.tabs[index];
    if (tab.created !== created || tab.modified !== modified) {
        const tsToFormat = modified || tab.modified || created || tab.created || "";
        tab.created = created || tab.created;
        tab.modified = modified || tab.modified;
        tab.formattedTimestamp = formatTimestampForDisplay(tsToFormat);
        editorStore.sessionDirty = true;
    }
}

export function markAsSaved(id: string) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    const tab = editorStore.tabs[index];
    tab.lastSavedContent = tab.content;
    tab.isDirty = false;
    editorStore.sessionDirty = true;
}

export function performTextTransform(operationId: OperationId) {
    if (textOperationCallback) textOperationCallback(operationId);
}

export function togglePin(id: string) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    editorStore.tabs[index].isPinned = !editorStore.tabs[index].isPinned;
    editorStore.sessionDirty = true;
}

export function updateTabTitle(id: string, title: string, customTitle?: string) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    const tab = editorStore.tabs[index];
    tab.title = title;
    if (customTitle !== undefined) {
        tab.customTitle = customTitle;
    }
    editorStore.sessionDirty = true;
}

export function updateTabPath(id: string, path: string, title?: string) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    const tab = editorStore.tabs[index];
    tab.path = path;
    if (title !== undefined) tab.title = title;
    editorStore.sessionDirty = true;
}

export function updateTabMetadataAndPath(id: string, updates: Partial<EditorTab>) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    editorStore.tabs[index] = { ...editorStore.tabs[index], ...updates };
    editorStore.sessionDirty = true;
}

export function setFileCheckStatus(id: string, performed: boolean, failed: boolean) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    const tab = editorStore.tabs[index];
    tab.fileCheckPerformed = performed;
    tab.fileCheckFailed = failed;
    editorStore.sessionDirty = true;
}

export function reloadTabContent(id: string, content: string, lineEnding: 'LF' | 'CRLF', encoding: string, sizeBytes: number) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    const tab = editorStore.tabs[index];
    tab.content = content;
    tab.lastSavedContent = content;
    tab.isDirty = false;
    tab.lineEnding = lineEnding;
    tab.encoding = encoding;
    tab.sizeBytes = sizeBytes;
    tab.fileCheckPerformed = false;
    editorStore.sessionDirty = true;
}

export function updateContentOnly(id: string, content: string) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    editorStore.tabs[index].content = content;
    editorStore.sessionDirty = true;
}

export function updateLineEnding(id: string, lineEnding: 'LF' | 'CRLF') {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    editorStore.tabs[index].lineEnding = lineEnding;
    editorStore.sessionDirty = true;
}

export function saveTabComplete(id: string, path: string, title: string, lineEnding: 'LF' | 'CRLF') {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    const tab = editorStore.tabs[index];
    tab.path = path;
    tab.title = title;
    tab.lineEnding = lineEnding;
    tab.fileCheckPerformed = false;
    tab.fileCheckFailed = false;
    editorStore.sessionDirty = true;
}

export function togglePreferredExtension(id: string) {
    const index = editorStore.tabs.findIndex(t => t.id === id);
    if (index === -1) {
        return;
    }
    const tab = editorStore.tabs[index];

    let current = tab.preferredExtension;

    if (!current) {
        if (tab.path) {
            current = isMarkdownFile(tab.path) ? 'md' : 'txt';
        } else {
            current = 'md';
        }
    }

    tab.preferredExtension = current === 'md' ? 'txt' : 'md';

    editorStore.sessionDirty = true;
}
