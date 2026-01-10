export type EditorMetrics = {
    lineCount: number;
    wordCount: number;
    charCount: number;
    cursorOffset: number;
    cursorLine: number;
    cursorCol: number;
    currentLineLength: number;
    currentWordIndex: number;
    insertMode: "INS" | "OVR";
};

// The state object
export const editorMetrics = $state({
    lineCount: 1,
    wordCount: 0,
    charCount: 0,
    cursorOffset: 0,
    cursorLine: 1,
    cursorCol: 1,
    currentLineLength: 0,
    currentWordIndex: 0,
    insertMode: "INS" as "INS" | "OVR",
});

// Logic functions
export function updateMetrics(metrics: Partial<EditorMetrics>) {
    if (metrics.lineCount !== undefined) editorMetrics.lineCount = metrics.lineCount;
    if (metrics.wordCount !== undefined) editorMetrics.wordCount = metrics.wordCount;
    if (metrics.charCount !== undefined) editorMetrics.charCount = metrics.charCount;
    if (metrics.cursorOffset !== undefined) editorMetrics.cursorOffset = metrics.cursorOffset;
    if (metrics.cursorLine !== undefined) editorMetrics.cursorLine = metrics.cursorLine;
    if (metrics.cursorCol !== undefined) editorMetrics.cursorCol = metrics.cursorCol;
    if (metrics.currentLineLength !== undefined)
        editorMetrics.currentLineLength = metrics.currentLineLength;
    if (metrics.currentWordIndex !== undefined)
        editorMetrics.currentWordIndex = metrics.currentWordIndex;
    if (metrics.insertMode !== undefined) editorMetrics.insertMode = metrics.insertMode;
}

export function toggleInsertMode() {
    editorMetrics.insertMode = editorMetrics.insertMode === "INS" ? "OVR" : "INS";
}
