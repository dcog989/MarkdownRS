export type EditorTab = {
    id: string;
    title: string;
    content: string;
    isDirty: boolean;
    path: string | null;
    scrollPercentage: number;
};

export class EditorStore {
    tabs = $state<EditorTab[]>([]);

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
