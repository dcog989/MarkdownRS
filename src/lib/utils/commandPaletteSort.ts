import type { Command } from '$lib/commands/commands';
import { appState } from '$lib/stores/appState.svelte';

export type SortMode = 'alphabetical' | 'recent' | 'most-used';

export const SORT_LABELS: Record<SortMode, string> = {
  alphabetical: 'A-Z',
  recent: 'Recent',
  'most-used': 'Most Used',
};

export function cycleSortMode() {
  const modes: SortMode[] = ['alphabetical', 'recent', 'most-used'];
  const idx = modes.indexOf(appState.commandPaletteSort);
  appState.commandPaletteSort = modes[(idx + 1) % modes.length];
}

export function sortCommands(
  commands: Command[],
  mode: SortMode,
  usage: Record<string, number>,
  usageCounts: Record<string, number>,
): Command[] {
  const sorted = [...commands];

  if (mode === 'alphabetical') {
    sorted.sort((a, b) => {
      const catA = a.category;
      const catB = b.category;
      if (catA !== catB) return catA.localeCompare(catB);
      return a.label.localeCompare(b.label);
    });
  } else if (mode === 'recent') {
    sorted.sort((a, b) => {
      const timeA = usage[a.id] ?? 0;
      const timeB = usage[b.id] ?? 0;
      if (timeB !== timeA) return timeB - timeA;
      return a.label.localeCompare(b.label);
    });
  } else if (mode === 'most-used') {
    sorted.sort((a, b) => {
      const countA = usageCounts[a.id] ?? 0;
      const countB = usageCounts[b.id] ?? 0;
      if (countB !== countA) return countB - countA;
      return a.label.localeCompare(b.label);
    });
  }

  return sorted;
}
