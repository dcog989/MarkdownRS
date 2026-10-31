import type { Command } from "@codemirror/view";
import type { Command as CommandDefinition } from "$lib/commands/types";
import { translate } from "$lib/i18n";
import { appContext } from "$lib/stores/state.svelte";
import { getActiveEditorView } from "$lib/utils/editorCommands";
import { isMarkdownTab } from "$lib/utils/fileValidation";

export function isCurrentFileMarkdown(): boolean {
  const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
  return isMarkdownTab(activeTab);
}

export function runEditorCommand(command: Command): boolean {
  const view = getActiveEditorView();
  if (view) return command(view);
  return false;
}

export function commandLabel(command: CommandDefinition): string {
  const key = typeof command.labelKey === "function" ? command.labelKey() : command.labelKey;
  return translate(key, command.labelValues ? { values: command.labelValues } : undefined);
}
