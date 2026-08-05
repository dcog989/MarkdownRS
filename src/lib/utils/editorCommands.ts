import { redo, undo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { translate } from '$lib/i18n';
import { promptDialog } from '$lib/stores/dialogStore.svelte';

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

export async function promptGoToLine(view: EditorView): Promise<boolean> {
  const doc = view.state.doc;
  const lineCount = doc.lines;
  const currentLine = doc.lineAt(view.state.selection.main.head).number;

  const input = await promptDialog({
    title: translate('editor.gotoLineTitle'),
    message: translate('editor.gotoLineMessage', { values: { total: lineCount } }),
    value: String(currentLine),
  });
  if (input === null) return false;

  const lineNo = Math.round(Number(input.trim()));
  if (!Number.isFinite(lineNo) || lineNo < 1 || lineNo > lineCount) return false;

  const pos = doc.line(lineNo).from;
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  view.focus();
  return true;
}

export function dispatchGoToLine(tabId: string): boolean {
  const view = editorInstances.get(tabId);
  if (!view) return false;
  void promptGoToLine(view);
  return true;
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
