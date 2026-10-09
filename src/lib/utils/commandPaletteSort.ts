import type { Command } from "$lib/commands/commands";
import { commandLabel } from "$lib/commands/helpers";
import { translate } from "$lib/i18n";

export type SortMode = "alphabetical" | "recent" | "most-used" | "categories";

export type SortDirection = "asc" | "desc";

export const SORT_MODES: SortMode[] = ["alphabetical", "recent", "most-used", "categories"];

export const SORT_LABEL_KEYS: Record<SortMode, string> = {
  alphabetical: "commandPalette.sortAZ",
  recent: "commandPalette.sortRecent",
  "most-used": "commandPalette.sortMostUsed",
  categories: "commandPalette.sortCategories",
};

/** Flips a comparator result when sorting descending. */
function directed(result: number, direction: SortDirection): number {
  return direction === "asc" ? result : -result;
}

function byLabel(a: Command, b: Command): number {
  return translate(commandLabel(a)).localeCompare(translate(commandLabel(b)));
}

function byCategory(a: Command, b: Command): number {
  return translate(a.category).localeCompare(translate(b.category));
}

export function sortCommands(
  commands: Command[],
  mode: SortMode,
  direction: SortDirection,
  usage: Record<string, number>,
  usageCounts: Record<string, number>,
): Command[] {
  const sorted = [...commands];

  if (mode === "alphabetical") {
    sorted.sort((a, b) => directed(byLabel(a, b), direction));
  } else if (mode === "categories") {
    sorted.sort((a, b) => directed(byCategory(a, b), direction) || byLabel(a, b));
  } else if (mode === "recent") {
    sorted.sort((a, b) => {
      const timeA = usage[a.id] ?? 0;
      const timeB = usage[b.id] ?? 0;
      return directed(timeA - timeB, direction) || byLabel(a, b);
    });
  } else if (mode === "most-used") {
    sorted.sort((a, b) => {
      const countA = usageCounts[a.id] ?? 0;
      const countB = usageCounts[b.id] ?? 0;
      return directed(countA - countB, direction) || byLabel(a, b);
    });
  }

  return sorted;
}
