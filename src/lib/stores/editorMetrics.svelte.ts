export type EditorMetrics = {
  cursorOffset: number;
  cursorLine: number;
  cursorCol: number;
  currentLineLength: number;
  currentWordIndex: number;
  insertMode: 'INS' | 'OVR';
  gutterWidth: number;
};

// The state object
export const editorMetrics = $state({
  cursorOffset: 0,
  cursorLine: 1,
  cursorCol: 1,
  currentLineLength: 0,
  currentWordIndex: 0,
  insertMode: 'INS' as 'INS' | 'OVR',
  gutterWidth: 0,
});

// Logic functions
export function updateMetrics(metrics: Partial<EditorMetrics>) {
  if (metrics.cursorOffset !== undefined) editorMetrics.cursorOffset = metrics.cursorOffset;
  if (metrics.cursorLine !== undefined) editorMetrics.cursorLine = metrics.cursorLine;
  if (metrics.cursorCol !== undefined) editorMetrics.cursorCol = metrics.cursorCol;
  if (metrics.currentLineLength !== undefined) editorMetrics.currentLineLength = metrics.currentLineLength;
  if (metrics.currentWordIndex !== undefined) editorMetrics.currentWordIndex = metrics.currentWordIndex;
  if (metrics.insertMode !== undefined) editorMetrics.insertMode = metrics.insertMode;
  if (metrics.gutterWidth !== undefined) editorMetrics.gutterWidth = metrics.gutterWidth;
}

export function toggleInsertMode() {
  editorMetrics.insertMode = editorMetrics.insertMode === 'INS' ? 'OVR' : 'INS';
}
