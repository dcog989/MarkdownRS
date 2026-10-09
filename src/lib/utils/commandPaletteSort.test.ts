import { describe, expect, it } from "vitest";
import type { Command } from "$lib/commands/commands";
import { sortCommands } from "./commandPaletteSort";

const commands: Command[] = [
  { id: "edit.save", label: "Save", category: "File" },
  { id: "file.open", label: "Open", category: "File" },
  { id: "view.toggle", label: "Toggle Preview", category: "View" },
  { id: "edit.undo", label: "Undo", category: "Edit" },
];

describe("sortCommands", () => {
  it("sorts alphabetically by label ascending", () => {
    const sorted = sortCommands(commands, "alphabetical", "asc", {}, {});
    expect(sorted.map((c) => c.label)).toEqual(["Open", "Save", "Toggle Preview", "Undo"]);
  });

  it("sorts alphabetically descending", () => {
    const sorted = sortCommands(commands, "alphabetical", "desc", {}, {});
    expect(sorted.map((c) => c.label)).toEqual(["Undo", "Toggle Preview", "Save", "Open"]);
  });

  it("sorts by category then label", () => {
    const sorted = sortCommands(commands, "categories", "asc", {}, {});
    expect(sorted.map((c) => c.label)).toEqual(["Undo", "Open", "Save", "Toggle Preview"]);
  });

  it("sorts by most recent usage with label tiebreak", () => {
    const usage = { "edit.undo": 100, "edit.save": 50 };
    const sorted = sortCommands(commands, "recent", "desc", usage, {});
    expect(sorted.map((c) => c.id)).toEqual(["edit.undo", "edit.save", "file.open", "view.toggle"]);
  });

  it("sorts by least recent usage ascending", () => {
    const usage = { "edit.undo": 100, "edit.save": 50 };
    const sorted = sortCommands(commands, "recent", "asc", usage, {});
    expect(sorted.map((c) => c.id)).toEqual(["file.open", "view.toggle", "edit.save", "edit.undo"]);
  });

  it("sorts by usage count with label tiebreak", () => {
    const usageCounts = { "file.open": 5, "view.toggle": 3 };
    const sorted = sortCommands(commands, "most-used", "desc", {}, usageCounts);
    expect(sorted.map((c) => c.id)).toEqual(["file.open", "view.toggle", "edit.save", "edit.undo"]);
  });

  it("does not mutate the input array", () => {
    const before = commands.map((c) => c.id);
    sortCommands(commands, "categories", "asc", {}, {});
    expect(commands.map((c) => c.id)).toEqual(before);
  });
});
