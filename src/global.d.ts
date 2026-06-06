import type { HistoryState } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

export interface AppEditorView extends EditorView {
  _currentTabId?: string;
  getHistoryState?: () => HistoryState | undefined;
  flushPendingContent?: () => void;
}

declare global {
  interface Window {
    _editorFlushFunctions?: Array<() => void>;
    _activeEditorView?: AppEditorView;
  }
}
