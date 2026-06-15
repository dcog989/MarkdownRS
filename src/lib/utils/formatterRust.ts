import { appContext } from '$lib/stores/state.svelte';
import { callBackendSafe } from '$lib/utils/backend';

export async function formatMarkdown(content: string): Promise<string> {
  const tab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
  const filePath = tab?.path ?? undefined;

  const result = await callBackendSafe('format_markdown', { content, filePath }, 'Markdown:Render');
  return result ? result.replace(/\r\n/g, '\n') : content;
}
