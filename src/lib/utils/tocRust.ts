import type { HeadingEntry } from "$lib/types/markdown";
import { callBackendSafe } from "./backend";

export async function generateDocumentToc(content: string, headings?: HeadingEntry[]): Promise<string> {
  return callBackendSafe("generate_document_toc", { content, headings }, "Markdown:TOC", {
    showToast: false,
  }) as Promise<string>;
}
