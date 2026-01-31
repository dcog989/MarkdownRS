/**
 * Editor Command Dispatch System
 * Provides global access to dispatch commands to the active editor
 */

import type { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';

// Store active editor references by tab ID
const editorInstances = new Map<string, EditorView>();

/**
 * Register an editor instance for a tab
 */
export function registerEditorInstance(tabId: string, view: EditorView): void {
    editorInstances.set(tabId, view);
}

/**
 * Unregister an editor instance when tab is closed
 */
export function unregisterEditorInstance(tabId: string): void {
    editorInstances.delete(tabId);
}

/**
 * Get the editor instance for a specific tab
 */
export function getEditorInstance(tabId: string): EditorView | undefined {
    return editorInstances.get(tabId);
}

/**
 * Dispatch undo command to a specific editor
 */
export function dispatchUndo(tabId: string): boolean {
    const view = editorInstances.get(tabId);
    if (!view) return false;

    return undo(view);
}

/**
 * Dispatch redo command to a specific editor
 */
export function dispatchRedo(tabId: string): boolean {
    const view = editorInstances.get(tabId);
    if (!view) return false;

    return redo(view);
}
