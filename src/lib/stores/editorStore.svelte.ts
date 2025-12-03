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

export class EditorStore {
    tabs = $state<EditorTab[]>([]);
    sessionDirty = $state(false);

    // MRU Stack: Index 0 is most recent
    mruStack = $state<string[]>([]);

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

    addTab(title: string = 'Untitled', content: string = '') {
        const id = crypto.randomUUID();
        const now = getCurrentTimestamp();
        this.tabs.push({
            id,
            title,
            content,
            isDirty: false,
            path: null,
            scrollPercentage: 0,
            created: now,
            modified: now
        });
        this.pushToMru(id);
        this.sessionDirty = true;
        return id;
    }

    closeTab(id: string) {
        this.tabs = this.tabs.filter(t => t.id !== id);
        this.mruStack = this.mruStack.filter(tId => tId !== id);
        this.sessionDirty = true;
    }

    // Call this whenever a tab is activated
    pushToMru(id: string) {
        // Remove existing occurrence
        this.mruStack = this.mruStack.filter(tId => tId !== id);
        // Add to front
        this.mruStack.unshift(id);
    }

    getNextTabId(currentId: string | null, shiftKey: boolean): string | null {
        if (this.tabs.length <= 1) return currentId;

        if (appState.tabCycling === 'mru') {
            // In MRU, if we just hit Ctrl+Tab (no shift), we want the 2nd item (index 1)
            // If we are already at the top, index 1 is the previous one.
            if (this.mruStack.length > 1) {
                // For simple toggling between two files:
                return this.mruStack[1];
            }
            return this.mruStack[0] || null;
        } else {
            // Sequential
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
        if (tab) {
            tab.content = content;
            tab.isDirty = true;
            tab.modified = getCurrentTimestamp();
            this.sessionDirty = true;
        }
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
        this.activeMetrics = { ...this.activeMetrics, ...metrics };
    }

    toggleInsertMode() {
        const newMode = this.activeMetrics.insertMode === 'INS' ? 'OVR' : 'INS';
        this.activeMetrics = { ...this.activeMetrics, insertMode: newMode };
    }

    modifyContent(id: string, modifier: (text: string) => string) {
        const tab = this.tabs.find(t => t.id === id);
        if (tab) {
            tab.content = modifier(tab.content);
            tab.isDirty = true;
            tab.modified = getCurrentTimestamp();
            this.sessionDirty = true;
        }
    }

    sortLines(id: string) { this.modifyContent(id, (text) => text.split('\n').sort().join('\n')); }
    trimWhitespace(id: string) { this.modifyContent(id, (text) => text.split('\n').map(line => line.trim()).join('\n')); }
    toUpperCase(id: string) { this.modifyContent(id, (text) => text.toUpperCase()); }
    toLowerCase(id: string) { this.modifyContent(id, (text) => text.toLowerCase()); }
}

export const editorStore = new EditorStore();
