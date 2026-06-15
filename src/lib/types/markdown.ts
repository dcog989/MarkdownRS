export type MarkdownFlavor = 'commonmark' | 'gfm';

export interface HeadingEntry {
  level: number;
  text: string;
  anchor_id: string;
}

export interface RenderResult {
  html: string;
  line_map: Record<number, number>;
  word_count: number;
  char_count: number;
  headings: HeadingEntry[];
}
