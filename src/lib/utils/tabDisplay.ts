import type { EditorTab } from "$lib/stores/editorTypes";
import { formatFileSize } from "$lib/utils/fileValidation";

/**
 * Tooltip for a tab: where it lives (path, or a "missing"/"unsaved" label), then
 * timestamp and size. `withTitle` prepends the tab's own name, for icon-only tabs
 * whose label is not on screen.
 */
export function tabTooltip(tab: EditorTab, labels: { missing: string; unsaved: string }, withTitle = false): string {
  const parts: string[] = [];
  if (tab.fileCheckFailed) {
    parts.push(labels.missing);
    if (tab.path) parts.push(tab.path);
  } else {
    parts.push(tab.path || labels.unsaved);
  }

  const size = formatFileSize(tab.sizeBytes || 0);
  const time = tab.formattedTimestamp || "";
  parts.push(time ? `${time}, ${size}` : size);

  return withTitle ? `${tab.customTitle || tab.title}\n${parts.join("\n")}` : parts.join("\n");
}
