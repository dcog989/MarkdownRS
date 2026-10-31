export type MarkdownFlavor = "commonmark" | "gfm";

export interface HeadingEntry {
  level: number;
  text: string;
  anchor_id: string;
}

export interface RenderResult {
  html: string;
  headings: HeadingEntry[];
}
