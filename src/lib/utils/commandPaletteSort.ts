import type { Command } from "$lib/commands/commands";
import { settingsState } from "$lib/stores/settingsState.svelte";

export type SortMode = "alphabetical" | "recent" | "most-used" | "categories";

export const SORT_MODES: SortMode[] = ["alphabetical", "recent", "most-used", "categories"];

export const SORT_LABEL_KEYS: Record<SortMode, string> = {
  alphabetical: "commandPalette.sortAZ",
  recent: "commandPalette.sortRecent",
  "most-used": "commandPalette.sortMostUsed",
  categories: "commandPalette.sortCategories",
};

export function cycleSortMode() {
  const idx = SORT_MODES.indexOf(settingsState.commandPaletteSort);
  settingsState.commandPaletteSort = SORT_MODES[(idx + 1) % SORT_MODES.length];
}

export function sortCommands(
  commands: Command[],
  mode: SortMode,
  usage: Record<string, number>,
  usageCounts: Record<string, number>,
): Command[] {
  const sorted = [...commands];

  if (mode === "alphabetical") {
    sorted.sort((a, b) => a.label.localeCompare(b.label));
  } else if (mode === "categories") {
    sorted.sort((a, b) => {
      const catA = a.category;
      const catB = b.category;
      if (catA !== catB) return catA.localeCompare(catB);
      return a.label.localeCompare(b.label);
    });
  } else if (mode === "recent") {
    sorted.sort((a, b) => {
      const timeA = usage[a.id] ?? 0;
      const timeB = usage[b.id] ?? 0;
      if (timeB !== timeA) return timeB - timeA;
      return a.label.localeCompare(b.label);
    });
  } else if (mode === "most-used") {
    sorted.sort((a, b) => {
      const countA = usageCounts[a.id] ?? 0;
      const countB = usageCounts[b.id] ?? 0;
      if (countB !== countA) return countB - countA;
      return a.label.localeCompare(b.label);
    });
  }

  return sorted;
}
