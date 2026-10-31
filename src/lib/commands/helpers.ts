import type { Command } from "@codemirror/view";
import type { Command as CommandDefinition } from "$lib/commands/types";
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

export function commandLabel(command: CommandDefinition): string {
  if (typeof command.labelKey === "function") return command.labelKey();
  return command.labelKey ?? command.label ?? command.id;
}
