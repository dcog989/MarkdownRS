import type { Command } from '@codemirror/view';
import { appContext } from '$lib/stores/state.svelte';
import { getActiveEditorView } from '$lib/utils/editorCommands';
import { isMarkdownFile } from '$lib/utils/fileValidation';

export function isCurrentFileMarkdown(): boolean {
  const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
  if (!activeTab) return true;
  return activeTab.path ? isMarkdownFile(activeTab.path) : true;
}

export function runEditorCommand(command: Command): void {
  const view = getActiveEditorView();
  if (view) command(view);
}
