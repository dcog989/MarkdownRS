import { extractNumber, linesFilter } from "./helpers";

export function sortLines(text: string, mode: string): string {
  const lines = text.split("\n");
  switch (mode) {
    case "asc":
      return lines.sort().join("\n");
    case "desc":
      return lines.sort().reverse().join("\n");
    case "case-insensitive-asc":
      return lines.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).join("\n");
    case "case-insensitive-desc":
      return lines.sort((a, b) => b.localeCompare(a, undefined, { sensitivity: "base" })).join("\n");
    case "numeric-asc":
      return lines.sort((a, b) => extractNumber(a) - extractNumber(b)).join("\n");
    case "numeric-desc":
      return lines.sort((a, b) => extractNumber(b) - extractNumber(a)).join("\n");
    case "length-asc":
      return lines.sort((a, b) => a.length - b.length).join("\n");
    case "length-desc":
      return lines.sort((a, b) => b.length - a.length).join("\n");
    default:
      return text;
  }
}

export function reverseLines(text: string): string {
  return text.split("\n").reverse().join("\n");
}

export function shuffleLines(text: string): string {
  const arr = text.split("\n");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("\n");
}

export function removeDuplicates(text: string): string {
  const seen = new Set<string>();
  return linesFilter(text, (l) => {
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}

export function removeUnique(text: string): string {
  const lines = text.split("\n");
  const counts = new Map<string, number>();
  for (const l of lines) {
    counts.set(l, (counts.get(l) || 0) + 1);
  }
  return lines.filter((l) => (counts.get(l) ?? 0) > 1).join("\n");
}
