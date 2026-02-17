import type { EditorView } from '@codemirror/view';
import type { HistoryState } from '@codemirror/commands';

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
