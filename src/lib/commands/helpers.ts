import { appContext } from '$lib/stores/state.svelte';
import { isMarkdownFile } from '$lib/utils/fileValidation';

export function isCurrentFileMarkdown(): boolean {
  const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
  if (!activeTab) return true;
  return activeTab.path ? isMarkdownFile(activeTab.path) : true;
}

export function dispatchKeyEvent(key: string, ctrl = true, shift = false, alt = false): void {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: ctrl,
    shiftKey: shift,
    altKey: alt,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement?.dispatchEvent(event);
}
