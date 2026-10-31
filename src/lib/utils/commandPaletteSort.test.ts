import { describe, expect, it } from "vitest";
import type { Command } from "$lib/commands/commands";
import { sortCommands } from "./commandPaletteSort";

const commands: Command[] = [
  { id: "edit.save", labelKey: "command.save", category: "commandCategory.edit" },
  { id: "file.open", labelKey: "fileTree.open", category: "commandCategory.file" },
  { id: "view.toggle", labelKey: "command.showOutline", category: "commandCategory.view" },
  { id: "edit.undo", labelKey: "command.undo", category: "commandCategory.edit" },
];

describe("sortCommands", () => {
  it("sorts alphabetically by label ascending", () => {
    const sorted = sortCommands(commands, "alphabetical", "asc", {}, {});
    expect(sorted.map((c) => c.id)).toEqual(["file.open", "edit.save", "view.toggle", "edit.undo"]);
  });

  it("sorts alphabetically descending", () => {
    const sorted = sortCommands(commands, "alphabetical", "desc", {}, {});
    expect(sorted.map((c) => c.id)).toEqual(["edit.undo", "view.toggle", "edit.save", "file.open"]);
  });

  it("sorts by category then label", () => {
    const sorted = sortCommands(commands, "categories", "asc", {}, {});
    expect(sorted.map((c) => c.id)).toEqual(["edit.save", "edit.undo", "file.open", "view.toggle"]);
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
