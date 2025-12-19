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
    // Use $state.raw for immutable collections to prevent deep proxy overhead
    tabs = $state.raw<EditorTab[]>([]);
    sessionDirty = $state(false);
    mruStack = $state<string[]>([]);
    closedTabsHistory = $state<ClosedTab[]>([]);

    // Metrics remain standard $state as they change frequently and are primitives
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
                const match = currentTitle.match(newTabPattern);
                if (match) maxNewNumber = Math.max(maxNewNumber, parseInt(match[1]));
            }
            finalTitle = `New-${maxNewNumber + 1}`;
            if (!content) finalContent = `# ${finalTitle}`;
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

        // Immutable update: Replace the array reference
        if (appState.newTabPosition === 'right' && appState.activeTabId) {
            const activeIndex = this.tabs.findIndex(t => t.id === appState.activeTabId);
            const newTabs = [...this.tabs];
            newTabs.splice(activeIndex + 1, 0, newTab);
            this.tabs = newTabs;
        } else {
            this.tabs = [...this.tabs, newTab];
        }

        this.pushToMru(id);
        this.sessionDirty = true;
        return id;
    }

    closeTab(id: string) {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index !== -1) {
            const tab = this.tabs[index];
            this.closedTabsHistory = [{ tab: { ...tab }, index }, ...this.closedTabsHistory.slice(0, 9)];
            this.tabs = this.tabs.filter(t => t.id !== id);
            this.mruStack = this.mruStack.filter(tId => tId !== id);
            this.sessionDirty = true;
        }
    }

    reopenLastClosed() {
        const lastClosed = this.closedTabsHistory[0];
        if (lastClosed) {
            this.closedTabsHistory = this.closedTabsHistory.slice(1);
            const insertIndex = Math.min(lastClosed.index, this.tabs.length);
            const newTabs = [...this.tabs];
            newTabs.splice(insertIndex, 0, lastClosed.tab);
            this.tabs = newTabs;
            this.pushToMru(lastClosed.tab.id);
            this.sessionDirty = true;
        }
    }

    pushToMru(id: string) {
        if (this.mruStack[0] === id) return;
        this.mruStack = [id, ...this.mruStack.filter(tId => tId !== id)];
    }

    updateContent(id: string, content: string) {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index === -1) return;

        const oldTab = this.tabs[index];
        if (oldTab.content === content) return;

        // Immutable update: Replace both the object and the array reference
        const updatedTab = {
            ...oldTab,
            content,
            isDirty: content !== oldTab.lastSavedContent,
            modified: getCurrentTimestamp(),
            sizeBytes: new TextEncoder().encode(content).length
        };

        const newTabs = [...this.tabs];
        newTabs[index] = updatedTab;
        this.tabs = newTabs;
        this.sessionDirty = true;
    }

    updateScroll(id: string, percentage: number, topLine?: number) {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index === -1) return;

        const tab = this.tabs[index];
        const isSignificant = Math.abs(tab.scrollPercentage - percentage) > 0.001 ||
            (topLine !== undefined && tab.topLine !== topLine);

        if (isSignificant) {
            const newTabs = [...this.tabs];
            newTabs[index] = { ...tab, scrollPercentage: percentage, topLine: topLine ?? tab.topLine };
            this.tabs = newTabs;
            this.sessionDirty = true;
        }
    }

    markAsSaved(id: string) {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index === -1) return;

        const newTabs = [...this.tabs];
        newTabs[index] = { ...this.tabs[index], lastSavedContent: this.tabs[index].content, isDirty: false };
        this.tabs = newTabs;
        this.sessionDirty = true;
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

    performTextTransform(operationId: OperationTypeString) {
        if (this.textOperationCallback) this.textOperationCallback({ type: operationId });
    }
}

export const editorStore = new EditorStore();
