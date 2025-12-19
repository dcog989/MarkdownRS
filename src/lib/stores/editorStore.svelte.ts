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
    topLine?: number;
    created?: string;
    modified?: string;
    originalTitle?: string;
    isPinned?: boolean;
    customTitle?: string;
    lineEnding: 'LF' | 'CRLF';
    encoding: string;
    fileCheckFailed?: boolean;
    fileCheckPerformed?: boolean;
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
    cursorLine: number;
    cursorCol: number;
    currentLineLength: number;
    currentWordIndex: number;
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

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

type TextOperationCallback = (operation: TextOperation) => void;

export type OperationTypeString =
    | 'sort-asc' | 'sort-desc' | 'sort-numeric-asc' | 'sort-numeric-desc'
    | 'sort-length-asc' | 'sort-length-desc' | 'reverse' | 'shuffle'
    | 'remove-duplicates' | 'remove-unique' | 'remove-blank'
    | 'remove-trailing-spaces' | 'remove-leading-spaces' | 'remove-all-spaces'
    | 'uppercase' | 'lowercase' | 'title-case' | 'sentence-case'
    | 'camel-case' | 'pascal-case' | 'snake-case' | 'kebab-case'
    | 'constant-case' | 'invert-case'
    | 'add-bullets' | 'add-numbers' | 'add-checkboxes' | 'remove-bullets'
    | 'blockquote' | 'remove-blockquote' | 'add-code-fence'
    | 'increase-heading' | 'decrease-heading'
    | 'trim-whitespace' | 'normalize-whitespace' | 'join-lines'
    | 'split-sentences' | 'wrap-quotes' | 'add-line-numbers'
    | 'indent-lines' | 'unindent-lines'
    | 'format-document'
    | 'sort-lines' | 'to-uppercase' | 'to-lowercase';

export type TextOperation = {
    type: OperationTypeString;
};

export class EditorStore {
    tabs = $state<EditorTab[]>([]);
    sessionDirty = $state(false);
    mruStack = $state<string[]>([]);
    closedTabsHistory = $state<ClosedTab[]>([]);

    lineCount = $state(1);
    wordCount = $state(0);
    charCount = $state(0);
    cursorOffset = $state(0);
    cursorLine = $state(1);
    cursorCol = $state(1);
    currentLineLength = $state(0);
    currentWordIndex = $state(0);
    insertMode = $state<'INS' | 'OVR'>('INS');

    private textOperationCallback: TextOperationCallback | null = null;

    registerTextOperationCallback(callback: TextOperationCallback) {
        this.textOperationCallback = callback;
    }

    unregisterTextOperationCallback() {
        this.textOperationCallback = null;
    }

    addTab(title: string = '', content: string = '') {
        const id = crypto.randomUUID();
        const now = getCurrentTimestamp();

        let finalTitle = title;
        let finalContent = content;

        if (!title || title === 'Untitled' || title === '') {
            const newTabPattern = /New-(\d+)/;
            let maxNewNumber = 0;

            for (const tab of this.tabs) {
                const currentTitle = tab.customTitle || tab.title || "";
                const match = currentTitle.match(newTabPattern) || (tab.originalTitle && tab.originalTitle.match(newTabPattern));

                if (match) {
                    maxNewNumber = Math.max(maxNewNumber, parseInt(match[1]));
                }
            }

            const nextNumber = maxNewNumber + 1;
            finalTitle = `New-${nextNumber}`;

            if (!content) {
                finalContent = `# ${finalTitle}`;
            }
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
            topLine: 1,
            created: now,
            modified: now,
            lineEnding: 'LF',
            encoding: 'UTF-8'
        };

        if (appState.newTabPosition === 'right' && appState.activeTabId) {
            const activeIndex = this.tabs.findIndex((t: EditorTab) => t.id === appState.activeTabId);
            if (activeIndex !== -1) {
                const newTabs = [...this.tabs];
                newTabs.splice(activeIndex + 1, 0, newTab);
                this.tabs = newTabs;
            } else {
                this.tabs = [...this.tabs, newTab];
            }
        } else {
            this.tabs = [...this.tabs, newTab];
        }

        this.pushToMru(id);
        this.sessionDirty = true;
        return id;
    }

    closeTab(id: string) {
        const index = this.tabs.findIndex((t: EditorTab) => t.id === id);
        if (index !== -1) {
            const tab = this.tabs[index];
            this.closedTabsHistory.unshift({ tab: { ...tab }, index });
            if (this.closedTabsHistory.length > 10) {
                this.closedTabsHistory.pop();
            }
        }
        this.tabs = this.tabs.filter((t: EditorTab) => t.id !== id);
        this.mruStack = this.mruStack.filter(tId => tId !== id);
        this.sessionDirty = true;
    }

    reopenLastClosed() {
        const lastClosed = this.closedTabsHistory.shift();
        if (lastClosed) {
            const insertIndex = Math.min(lastClosed.index, this.tabs.length);
            const newTabs = [...this.tabs];
            newTabs.splice(insertIndex, 0, lastClosed.tab);
            this.tabs = newTabs;
            this.pushToMru(lastClosed.tab.id);
            this.sessionDirty = true;
        }
    }

    pushToMru(id: string) {
        if (this.mruStack.length > 0 && this.mruStack[0] === id) return;
        const filtered = this.mruStack.filter(tId => tId !== id);
        this.mruStack = [id, ...filtered];
        this.sessionDirty = true;
    }

    getNextTabId(currentId: string | null, shiftKey: boolean): string | null {
        if (this.tabs.length <= 1) return currentId;

        if (appState.tabCycling === 'mru') {
            if (this.mruStack.length > 1) {
                return this.mruStack[1];
            }
            return this.mruStack[0] || null;
        } else {
            const currentIndex = this.tabs.findIndex((t: EditorTab) => t.id === currentId);
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
        const index = this.tabs.findIndex((t: EditorTab) => t.id === id);
        if (index === -1) return;

        const tab = { ...this.tabs[index] };
        tab.content = content;
        tab.isDirty = content !== tab.lastSavedContent;
        tab.modified = getCurrentTimestamp();
        tab.sizeBytes = new TextEncoder().encode(content).length;

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

        const newTabs = [...this.tabs];
        newTabs[index] = tab;
        this.tabs = newTabs;
        this.sessionDirty = true;
    }

    markAsSaved(id: string) {
        const index = this.tabs.findIndex((t: EditorTab) => t.id === id);
        if (index !== -1) {
            const tab = { ...this.tabs[index], lastSavedContent: this.tabs[index].content, isDirty: false };
            const newTabs = [...this.tabs];
            newTabs[index] = tab;
            this.tabs = newTabs;
            this.sessionDirty = true;
        }
    }

    updateScroll(id: string, percentage: number, topLine?: number) {
        const index = this.tabs.findIndex((t: EditorTab) => t.id === id);
        if (index === -1) return;

        const tab = this.tabs[index];
        const isSignificantMove =
            Math.abs(tab.scrollPercentage - percentage) > 0.005 ||
            (topLine !== undefined && Math.floor(tab.topLine || 0) !== Math.floor(topLine));

        if (isSignificantMove) {
            const updatedTab = { ...tab, scrollPercentage: percentage };
            if (topLine !== undefined) updatedTab.topLine = topLine;

            const newTabs = [...this.tabs];
            newTabs[index] = updatedTab;
            this.tabs = newTabs;
            this.sessionDirty = true;
        }
    }

    updateMetadata(id: string, created?: string, modified?: string) {
        const index = this.tabs.findIndex((t: EditorTab) => t.id === id);
        if (index !== -1) {
            const updatedTab = { ...this.tabs[index] };
            if (created) updatedTab.created = created;
            if (modified) updatedTab.modified = modified;

            const newTabs = [...this.tabs];
            newTabs[index] = updatedTab;
            this.tabs = newTabs;
            this.sessionDirty = true;
        }
    }

    updateMetrics(metrics: Partial<EditorMetrics>) {
        if (metrics.lineCount !== undefined) this.lineCount = metrics.lineCount;
        if (metrics.wordCount !== undefined) this.wordCount = metrics.wordCount;
        if (metrics.charCount !== undefined) this.charCount = metrics.charCount;
        if (metrics.cursorOffset !== undefined) this.cursorOffset = metrics.cursorOffset;
        if (metrics.cursorLine !== undefined) this.cursorLine = metrics.cursorLine;
        if (metrics.cursorCol !== undefined) this.cursorCol = metrics.cursorCol;
        if (metrics.currentLineLength !== undefined) this.currentLineLength = metrics.currentLineLength;
        if (metrics.currentWordIndex !== undefined) this.currentWordIndex = metrics.currentWordIndex;
        if (metrics.insertMode !== undefined) this.insertMode = metrics.insertMode;
    }

    toggleInsertMode() {
        this.insertMode = this.insertMode === 'INS' ? 'OVR' : 'INS';
    }

    sortLines() {
        if (this.textOperationCallback) this.textOperationCallback({ type: 'sort-asc' });
    }

    trimWhitespace() {
        if (this.textOperationCallback) this.textOperationCallback({ type: 'trim-whitespace' });
    }

    toUpperCase() {
        if (this.textOperationCallback) this.textOperationCallback({ type: 'uppercase' });
    }

    toLowerCase() {
        if (this.textOperationCallback) this.textOperationCallback({ type: 'lowercase' });
    }

    performTextTransform(operationId: OperationTypeString) {
        if (this.textOperationCallback) this.textOperationCallback({ type: operationId });
    }
}

export const editorStore = new EditorStore();
