import type { HeadingEntry } from "$lib/types/markdown";

export const previewHeadingsCache = $state<{
  content: string;
  headings: HeadingEntry[];
}>({
  content: "",
  headings: [],
});

export function cachePreviewHeadings(content: string, headings: HeadingEntry[]): void {
  previewHeadingsCache.content = content;
  previewHeadingsCache.headings = headings;
}
