function tokenizeSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = "";
  let inQuote = false;

  for (const char of text) {
    current += char;
    if (char === '"' || char === "'") {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /[.!?]/.test(char)) {
      const nextChar = text[text.indexOf(char) + 1];
      if (!nextChar || /\s/.test(nextChar)) {
        sentences.push(current.trim());
        current = "";
      }
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences.filter((s) => s.length > 0);
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "dare",
  "ought",
  "used",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "also",
  "now",
  "i",
  "me",
  "my",
  "myself",
  "we",
  "our",
  "ours",
  "ourselves",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "he",
  "him",
  "his",
  "himself",
  "she",
  "her",
  "hers",
  "herself",
  "it",
  "its",
  "itself",
  "they",
  "them",
  "their",
  "theirs",
  "themselves",
  "what",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "am",
  "having",
  "doing",
  "because",
  "until",
  "while",
  "about",
  "against",
  "any",
  "both",
  "down",
  "up",
  "out",
  "off",
  "over",
  "get",
  "got",
  "go",
  "went",
  "come",
  "came",
  "say",
  "said",
  "make",
  "made",
  "take",
  "took",
  "see",
  "saw",
  "know",
  "knew",
  "think",
  "thought",
  "want",
  "like",
  "use",
  "find",
  "give",
  "tell",
  "try",
  "call",
  "keep",
  "let",
  "put",
  "seem",
  "help",
  "show",
  "hear",
  "play",
  "run",
  "move",
  "live",
  "believe",
  "hold",
  "bring",
  "happen",
  "write",
  "provide",
  "sit",
  "stand",
  "lose",
  "pay",
  "meet",
  "include",
  "continue",
  "set",
  "learn",
  "change",
  "lead",
  "understand",
  "watch",
  "follow",
  "stop",
  "create",
  "speak",
  "read",
  "allow",
  "add",
  "spend",
  "grow",
  "open",
  "walk",
  "win",
  "offer",
  "remember",
  "love",
  "consider",
  "appear",
  "buy",
  "wait",
  "serve",
  "die",
  "send",
  "expect",
  "build",
  "stay",
  "fall",
  "cut",
  "reach",
  "kill",
  "remain",
  "suggest",
  "raise",
  "pass",
  "sell",
  "require",
  "report",
  "decide",
  "pull",
  "however",
  "yet",
  "still",
  "even",
]);

function getContentWords(sentence: string): Set<string> {
  return new Set(
    sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function smartParagraphs(text: string): string {
  if (!text.trim()) return text;
  const sentences = tokenizeSentences(text);
  if (sentences.length < 3) return text;

  const THRESHOLD = 0.25;
  const MIN_PARAGRAPH_SIZE = 2;

  const words = sentences.map(getContentWords);
  const paragraphs: string[][] = [[sentences[0]]];

  for (let i = 1; i < sentences.length; i++) {
    const sim = jaccardSimilarity(words[i - 1], words[i]);
    const currentParaSize = paragraphs[paragraphs.length - 1].length;

    if (sim < THRESHOLD && currentParaSize >= MIN_PARAGRAPH_SIZE) {
      paragraphs.push([]);
    }
    paragraphs[paragraphs.length - 1].push(sentences[i]);
  }

  if (paragraphs.length === 1) {
    const mid = Math.ceil(sentences.length / 2);
    return `${sentences.slice(0, mid).join(" ")}\n\n${sentences.slice(mid).join(" ")}`;
  }

  return paragraphs.map((p) => p.join(" ")).join("\n\n");
}
