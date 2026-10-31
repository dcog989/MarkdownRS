import { toggleRumdlConfig } from "$lib/stores/interfaceStore.svelte";
import { getCurrentDate } from "$lib/utils/date";
import { getActiveEditorView } from "$lib/utils/editorCommands";
import { extractSmartTitle } from "$lib/utils/smartTitle";
import { isCurrentFileMarkdown } from "./helpers";
import type { Command } from "./types";

const FRONTMATTER_DELIMITERS = new Set(["---", "+++", ";;;"]);

function insertFrontmatter(): boolean {
  if (!isCurrentFileMarkdown()) return false;
  const view = getActiveEditorView();
  if (!view) return false;
  const doc = view.state.doc;
  if (FRONTMATTER_DELIMITERS.has(doc.line(1).text.trimEnd())) return false;

  const title = extractSmartTitle(doc.toString()) ?? "";
  // JSON-quoted so titles containing `:` or `#` stay valid YAML.
  const titleValue = title ? JSON.stringify(title) : "";
  const ending = doc.length > 0 ? "\n\n" : "\n";
  const snippet = `---\ntitle: ${titleValue}\ndate: ${getCurrentDate()}\n---${ending}`;

  view.dispatch({
    changes: { from: 0, insert: snippet },
    selection: { anchor: "---\ntitle: ".length + titleValue.length },
  });
  view.focus();
  return true;
}

export const markdownCommands: Command[] = [
  {
    id: "markdown.insertFrontmatter",
    labelKey: "command.insertFrontmatter",
    category: "commandCategory.insert",
    handler: insertFrontmatter,
  },
  {
    id: "markdown.editRumdlConfig",
    labelKey: "command.editRumdlConfig",
    category: "commandCategory.markdown",
    handler: toggleRumdlConfig,
  },
];
