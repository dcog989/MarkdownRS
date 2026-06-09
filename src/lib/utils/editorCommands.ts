import { redo, undo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

const editorInstances = new Map<string, EditorView>();

export function registerEditorInstance(tabId: string, view: EditorView): void {
  editorInstances.set(tabId, view);
}

export function unregisterEditorInstance(tabId: string): void {
  editorInstances.delete(tabId);
}

export function getEditorInstance(tabId: string): EditorView | undefined {
  return editorInstances.get(tabId);
}

export function dispatchUndo(tabId: string): boolean {
  const view = editorInstances.get(tabId);
  if (!view) return false;
  return undo(view);
}

export function dispatchRedo(tabId: string): boolean {
  const view = editorInstances.get(tabId);
  if (!view) return false;
  return redo(view);
}

// Flush function registry — replaces window._editorFlushFunctions
const flushFunctions = new Set<() => void>();

export function registerFlushFn(fn: () => void): void {
  flushFunctions.add(fn);
}

export function unregisterFlushFn(fn: () => void): void {
  flushFunctions.delete(fn);
}

export function runFlushFunctions(): void {
  for (const fn of flushFunctions) fn();
}

// Active editor view — replaces window._activeEditorView
let activeEditorView: EditorView | undefined;

export function setActiveEditorView(view: EditorView | undefined): void {
  activeEditorView = view;
}

export function getActiveEditorView(): EditorView | undefined {
  return activeEditorView;
}
