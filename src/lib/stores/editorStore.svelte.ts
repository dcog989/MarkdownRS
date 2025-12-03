export type EditorTab = {
    id: string;
    title: string;
    content: string;
    isDirty: boolean;
    path: string | null;
    scrollPercentage: number;
    // Cache metadata per tab
    created?: string;
    modified?: string;
};

export type EditorMetrics = {
    lineCount: number;
    wordCount: number;
    charCount: number;      // Total characters
    cursorOffset: number;   // Characters before caret
    sizeKB: number;
    cursorLine: number;
    cursorCol: number;
    insertMode: 'INS' | 'OVR';
};

export class EditorStore {
    tabs = $state<EditorTab[]>([]);

    // Transient state for the active tab's status bar
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
        this.tabs.push({
            id,
            title,
            content,
            isDirty: false,
            path: null,
            scrollPercentage: 0
        });
        return id;
    }

    closeTab(id: string) {
        this.tabs = this.tabs.filter(t => t.id !== id);
    }

    updateContent(id: string, content: string) {
        const tab = this.tabs.find(t => t.id === id);
        if (tab) {
            tab.content = content;
            tab.isDirty = true;
        }
    }

    updateScroll(id: string, percentage: number) {
        const tab = this.tabs.find(t => t.id === id);
        if (tab) {
            tab.scrollPercentage = percentage;
        }
    }

    updateMetadata(id: string, created?: string, modified?: string) {
        const tab = this.tabs.find(t => t.id === id);
        if (tab) {
            tab.created = created;
            tab.modified = modified;
        }
    }

    updateMetrics(metrics: Partial<EditorMetrics>) {
        this.activeMetrics = { ...this.activeMetrics, ...metrics };
    }

    toggleInsertMode() {
        const newMode = this.activeMetrics.insertMode === 'INS' ? 'OVR' : 'INS';
        this.activeMetrics = { ...this.activeMetrics, insertMode: newMode };
    }

    // Text Operations
    modifyContent(id: string, modifier: (text: string) => string) {
        const tab = this.tabs.find(t => t.id === id);
        if (tab) {
            tab.content = modifier(tab.content);
            tab.isDirty = true;
        }
    }

    sortLines(id: string) {
        this.modifyContent(id, (text) => text.split('\n').sort().join('\n'));
    }

    trimWhitespace(id: string) {
        this.modifyContent(id, (text) => text.split('\n').map(line => line.trim()).join('\n'));
    }

    toUpperCase(id: string) {
        this.modifyContent(id, (text) => text.toUpperCase());
    }

    toLowerCase(id: string) {
        this.modifyContent(id, (text) => text.toLowerCase());
    }
}

export const editorStore = new EditorStore();
