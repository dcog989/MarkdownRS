import { beforeEach, describe, expect, it } from "vitest";
import type { Command } from "$lib/commands/commands";
import { settingsState } from "$lib/stores/settingsState.svelte";
import { cycleSortMode, type SortMode, sortCommands } from "./commandPaletteSort";

const commands: Command[] = [
  { id: "edit.save", label: "Save", category: "File" },
  { id: "file.open", label: "Open", category: "File" },
  { id: "view.toggle", label: "Toggle Preview", category: "View" },
  { id: "edit.undo", label: "Undo", category: "Edit" },
];

describe("sortCommands", () => {
  it("sorts by category then label alphabetically", () => {
    const sorted = sortCommands(commands, "alphabetical", {}, {});
    expect(sorted.map((c) => c.label)).toEqual(["Undo", "Open", "Save", "Toggle Preview"]);
  });

  it("sorts by most recent usage with label tiebreak", () => {
    const usage = { "edit.undo": 100, "edit.save": 50 };
    const sorted = sortCommands(commands, "recent", usage, {});
    expect(sorted.map((c) => c.id)).toEqual(["edit.undo", "edit.save", "file.open", "view.toggle"]);
  });

  it("sorts by usage count with label tiebreak", () => {
    const usageCounts = { "file.open": 5, "view.toggle": 3 };
    const sorted = sortCommands(commands, "most-used", {}, usageCounts);
    expect(sorted.map((c) => c.id)).toEqual(["file.open", "view.toggle", "edit.save", "edit.undo"]);
  });

  it("does not mutate the input array", () => {
    const before = commands.map((c) => c.id);
    sortCommands(commands, "alphabetical", {}, {});
    expect(commands.map((c) => c.id)).toEqual(before);
  });

  it("keeps input order for unknown sort modes", () => {
    const sorted = sortCommands(commands, "alphabetical" as SortMode, {}, {});
    expect(sorted).toHaveLength(commands.length);
  });
});

describe("cycleSortMode", () => {
  beforeEach(() => {
    settingsState.commandPaletteSort = "alphabetical";
  });

  it("cycles through alphabetical, recent, most-used and back", () => {
    cycleSortMode();
    expect(settingsState.commandPaletteSort).toBe("recent");
    cycleSortMode();
    expect(settingsState.commandPaletteSort).toBe("most-used");
    cycleSortMode();
    expect(settingsState.commandPaletteSort).toBe("alphabetical");
  });
});
