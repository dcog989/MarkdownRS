import type { Command } from "@codemirror/view";
import { appContext } from "$lib/stores/state.svelte";
import { getActiveEditorView } from "$lib/utils/editorCommands";
import { isMarkdownFile } from "$lib/utils/fileValidation";

export function isCurrentFileMarkdown(): boolean {
  const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
  if (!activeTab) return true;
  if (activeTab.path) return isMarkdownFile(activeTab.path);
  return activeTab.preferredExtension !== "txt";
}

export function runEditorCommand(command: Command): boolean {
  const view = getActiveEditorView();
  if (view) return command(view);
  return false;
}
