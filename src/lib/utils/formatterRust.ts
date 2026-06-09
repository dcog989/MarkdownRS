import { appContext } from '$lib/stores/state.svelte.ts';
import { callBackendSafe } from '$lib/utils/backend';

export interface FormatterOptions {
  listIndent: number;
  codeBlockFence: '```' | '~~~';
  bulletChar: '-' | '*' | '+';
  emphasisChar: '*' | '_';
}

export async function formatMarkdown(content: string, options: Partial<FormatterOptions> = {}): Promise<string> {
  const apiOptions = {
    flavor: appContext.app.markdownFlavor,
    listIndent: options.listIndent ?? appContext.app.defaultIndent,
    bulletChar: options.bulletChar ?? appContext.app.formatterBulletChar,
    codeBlockFence: options.codeBlockFence ?? appContext.app.formatterCodeFence,
    emphasisChar: options.emphasisChar ?? appContext.app.formatterEmphasisChar,
  };

  const result = await callBackendSafe(
    'format_markdown',
    {
      content,
      ...apiOptions,
    },
    'Markdown:Render',
  );
  // Ensure consistent line endings (LF) to match CodeMirror's internal state
  // This prevents the editor from detecting changes when only line endings differ
  return result ? result.replace(/\r\n/g, '\n') : content;
}
