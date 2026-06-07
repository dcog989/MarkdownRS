import { callBackendSafe } from './backend';

export async function generateDocumentToc(content: string): Promise<string> {
  return callBackendSafe('generate_document_toc', { content }, 'Markdown:TOC', {
    showToast: false,
  }) as Promise<string>;
}
