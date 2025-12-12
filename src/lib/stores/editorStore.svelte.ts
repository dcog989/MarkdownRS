import { appState } from "./appState.svelte";

export type EditorTab = {
    id: string;
    title: string;
    content: string;
    isDirty: boolean;
    path: string | null;
    scrollPercentage: number;
    created?: string;
    modified?: string;
    originalTitle?: string;
    isPinned?: boolean;
    customTitle?: string;
    lineEnding: 'LF' | 'CRLF';
    encoding: string;
};

export type ClosedTab = {
    tab: EditorTab;
    index: number;
};

export type EditorMetrics = {
    lineCount: number;
    wordCount: number;
    charCount: number;
    cursorOffset: number;
    sizeKB: number;
    cursorLine: number;
    cursorCol: number;
    insertMode: 'INS' | 'OVR';
};

function getCurrentTimestamp(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const MM = String(d.getMinutes()).padStart(2, '0');
    const SS = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd} / ${HH}${MM}${SS}`;
}

// Event system for text operations
type TextOperationCallback = (operation: TextOperation) => void;

export type TextOperation = 
    // Sort operations
    | { type: 'sort-asc' }
    | { type: 'sort-desc' }
    | { type: 'sort-numeric-asc' }
    | { type: 'sort-numeric-desc' }
    | { type: 'sort-length-asc' }
    | { type: 'sort-length-desc' }
    | { type: 'reverse' }
    | { type: 'shuffle' }
    // Remove operations
    | { type: 'remove-duplicates' }
    | { type: 'remove-unique' }
    | { type: 'remove-blank' }
    | { type: 'remove-trailing-spaces' }
    | { type: 'remove-leading-spaces' }
    | { type: 'remove-all-spaces' }
    // Case operations
    | { type: 'uppercase' }
    | { type: 'lowercase' }
    | { type: 'title-case' }
    | { type: 'sentence-case' }
    | { type: 'camel-case' }
    | { type: 'pascal-case' }
    | { type: 'snake-case' }
    | { type: 'kebab-case' }
    | { type: 'constant-case' }
    | { type: 'invert-case' }
    // Markdown operations
    | { type: 'add-bullets' }
    | { type: 'add-numbers' }
    | { type: 'add-checkboxes' }
    | { type: 'remove-bullets' }
    | { type: 'blockquote' }
    | { type: 'remove-blockquote' }
    | { type: 'add-code-fence' }
    | { type: 'increase-heading' }
    | { type: 'decrease-heading' }
    // Text manipulation
    | { type: 'trim-whitespace' }
    | { type: 'normalize-whitespace' }
    | { type: 'join-lines' }
    | { type: 'split-sentences' }
    | { type: 'wrap-quotes' }
    | { type: 'add-line-numbers' }
    | { type: 'indent-lines' }
    | { type: 'unindent-lines' }
    // Formatter
    | { type: 'format-document' }
    // Legacy (kept for compatibility)
    | { type: 'sort-lines' }
    | { type: 'to-uppercase' }
    | { type: 'to-lowercase' };

export class EditorStore {
    tabs = $state<EditorTab[]>([]);
    sessionDirty = $state(false);
    mruStack = $state<string[]>([]);
    closedTabsHistory = $state<ClosedTab[]>([]);
    
    // Callback for text operations that need to run on the editor
    private textOperationCallback: TextOperationCallback | null = null;

    activeMetrics = $state<EditorMetrics>({
        lineCount: 1,
        wordCount: 0,
        charCount: 0,
        cursorOffset: 0,
        sizeKB: 0,
        cursorLine: 1,
        cursorCol: 1,
        insertMode: 'INS'
    });
    
    registerTextOperationCallback(callback: TextOperationCallback) {
        this.textOperationCallback = callback;
    }
    
    unregisterTextOperationCallback() {
        this.textOperationCallback = null;
    }

    addTab(title: string = 'Untitled', content: string = '') {
        const id = crypto.randomUUID();
        const now = getCurrentTimestamp();

        const newTab: EditorTab = {
            id,
            title,
            originalTitle: title,
            content,
            isDirty: false,
            path: null,
            scrollPercentage: 0,
            created: now,
            modified: now,
            lineEnding: 'LF',
            encoding: 'UTF-8'
        };

        this.tabs = [...this.tabs, newTab];
        this.pushToMru(id);
        this.sessionDirty = true;
        return id;
    }

    closeTab(id: string) {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index !== -1) {
            const tab = this.tabs[index];
            this.closedTabsHistory.unshift({ tab: { ...tab }, index });
            if (this.closedTabsHistory.length > 10) {
                this.closedTabsHistory.pop();
            }
        }
        this.tabs = this.tabs.filter(t => t.id !== id);
        this.mruStack = this.mruStack.filter(tId => tId !== id);
        this.sessionDirty = true;
    }

    reopenLastClosed() {
        const lastClosed = this.closedTabsHistory.shift();
        if (lastClosed) {
            const insertIndex = Math.min(lastClosed.index, this.tabs.length);
            this.tabs.splice(insertIndex, 0, lastClosed.tab);
            this.pushToMru(lastClosed.tab.id);
            this.sessionDirty = true;
        }
    }

    pushToMru(id: string) {
        const filtered = this.mruStack.filter(tId => tId !== id);
        this.mruStack = [id, ...filtered];
    }

    getNextTabId(currentId: string | null, shiftKey: boolean): string | null {
        if (this.tabs.length <= 1) return currentId;

        if (appState.tabCycling === 'mru') {
            if (this.mruStack.length > 1) {
                return this.mruStack[1];
            }
            return this.mruStack[0] || null;
        } else {
            const currentIndex = this.tabs.findIndex(t => t.id === currentId);
            if (currentIndex === -1) return this.tabs[0]?.id || null;

            let nextIndex;
            if (shiftKey) {
                nextIndex = currentIndex - 1;
                if (nextIndex < 0) nextIndex = this.tabs.length - 1;
            } else {
                nextIndex = currentIndex + 1;
                if (nextIndex >= this.tabs.length) nextIndex = 0;
            }
            return this.tabs[nextIndex].id;
        }
    }

    updateContent(id: string, content: string) {
        const tab = this.tabs.find(t => t.id === id);
        if (!tab) return;

        tab.content = content;
        tab.isDirty = true;
        tab.modified = getCurrentTimestamp();

        if (!tab.path) {
            const trimmed = content.trim();
            if (trimmed.length > 0) {
                const firstLine = trimmed.split('\n')[0].trim();
                let smartTitle = firstLine.substring(0, 20);
                if (firstLine.length > 20) smartTitle += "...";
                tab.title = smartTitle;
            } else {
                if (tab.originalTitle) tab.title = tab.originalTitle;
            }
        }

        this.sessionDirty = true;
    }

    updateScroll(id: string, percentage: number) {
        const tab = this.tabs.find(t => t.id === id);
        if (tab) {
            tab.scrollPercentage = percentage;
            this.sessionDirty = true;
        }
    }

    updateMetadata(id: string, created?: string, modified?: string) {
        const tab = this.tabs.find(t => t.id === id);
        if (tab) {
            if (created) tab.created = created;
            if (modified) tab.modified = modified;
            this.sessionDirty = true;
        }
    }

    updateMetrics(metrics: Partial<EditorMetrics>) {
        Object.assign(this.activeMetrics, metrics);
    }

    toggleInsertMode() {
        this.activeMetrics.insertMode = this.activeMetrics.insertMode === 'INS' ? 'OVR' : 'INS';
    }

    // Text operations now delegate to the active editor
    sortLines() {
        if (this.textOperationCallback) {
            this.textOperationCallback({ type: 'sort-asc' });
        }
    }

    trimWhitespace() {
        if (this.textOperationCallback) {
            this.textOperationCallback({ type: 'trim-whitespace' });
        }
    }

    toUpperCase() {
        if (this.textOperationCallback) {
            this.textOperationCallback({ type: 'uppercase' });
        }
    }

    toLowerCase() {
        if (this.textOperationCallback) {
            this.textOperationCallback({ type: 'lowercase' });
        }
    }
    
    // New unified method for all transformations
    performTextTransform(operationId: string) {
        if (this.textOperationCallback) {
            this.textOperationCallback({ type: operationId as any });
        }
    }
}

export const editorStore = new EditorStore();
