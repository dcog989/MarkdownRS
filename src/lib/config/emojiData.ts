import emojilib from 'emojilib';

/**
 * A single emoji from the emojilib dataset. The canonical shortcode is the
 * first entry of emojilib's keyword array; the rest are search keywords.
 */
export interface EmojiEntry {
  char: string;
  shortcode: string;
  keywords: string[];
}

const RAW_EMOJI: Record<string, string[]> = emojilib;

export const emojiEntries: EmojiEntry[] = Object.entries(RAW_EMOJI).map(([char, keywords]) => ({
  char,
  shortcode: keywords[0] ?? '',
  keywords,
}));

const MAX_AUTOCOMPLETE_RESULTS = 20;

const emojiHaystacks: { entry: EmojiEntry; haystack: string }[] = emojiEntries.map((entry) => ({
  entry,
  haystack: entry.keywords.join(' ').toLowerCase(),
}));

/** Case-insensitive substring search across emoji shortcodes and keywords. */
export function searchEmojis(query: string, limit: number = emojiHaystacks.length): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return emojiEntries.slice(0, limit);
  const results: EmojiEntry[] = [];
  for (const { entry, haystack } of emojiHaystacks) {
    if (haystack.includes(q)) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/** Candidate list for the editor `:shortcode:` autocomplete, best match first. */
export function autocompleteEmojis(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return emojiEntries.slice(0, MAX_AUTOCOMPLETE_RESULTS);
  const scored: { entry: EmojiEntry; score: number }[] = [];
  for (const { entry, haystack } of emojiHaystacks) {
    if (!haystack.includes(q)) continue;
    scored.push({ entry, score: scoreEntry(entry, q) });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, MAX_AUTOCOMPLETE_RESULTS).map((s) => s.entry);
}

function scoreEntry(entry: EmojiEntry, query: string): number {
  if (entry.shortcode === query) return 0;
  if (entry.shortcode.startsWith(query)) return 1;
  if (entry.keywords.includes(query)) return 2;
  if (entry.keywords.some((k) => k.startsWith(query))) return 3;
  return 4;
}

/** Result list for the emoji picker modal grid (all matches, scrollable). */
export function pickerEmojis(query: string): EmojiEntry[] {
  return searchEmojis(query);
}
