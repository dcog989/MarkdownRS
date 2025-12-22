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

class EditorMetricsStore {
    lineCount = $state(1);
    wordCount = $state(0);
    charCount = $state(0);
    cursorOffset = $state(0);
    cursorLine = $state(1);
    cursorCol = $state(1);
    currentLineLength = $state(0);
    currentWordIndex = $state(0);
    insertMode = $state<'INS' | 'OVR'>('INS');

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
}

export const editorMetrics = new EditorMetricsStore();
