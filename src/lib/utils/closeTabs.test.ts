import { describe, expect, it } from "vitest";
import { type CloseManyMode, selectTabsToClose } from "./closeTabs";

const tabs = [
  { id: "pinned", isDirty: false, isPinned: true },
  { id: "dirty", isDirty: true, isPinned: false },
  { id: "clean", isDirty: false, isPinned: false },
];

function ids(mode: CloseManyMode, tabId?: string): string[] {
  return selectTabsToClose(tabs, mode, tabId).map((tab) => tab.id);
}

describe("selectTabsToClose", () => {
  it("skips pinned tabs in every mode except the forced close", () => {
    expect(ids("saved")).toEqual(["clean"]);
    expect(ids("unsaved")).toEqual(["dirty"]);
    expect(ids("others", "dirty")).toEqual(["clean"]);
    expect(ids("unpinned")).toEqual(["dirty", "clean"]);
    expect(ids("all")).toEqual(["pinned", "dirty", "clean"]);
  });

  it("takes the right/left range from a tab, and nothing without one", () => {
    expect(ids("right", "pinned")).toEqual(["dirty", "clean"]);
    expect(ids("left", "clean")).toEqual(["dirty"]);
    expect(ids("right")).toEqual([]);
    expect(ids("left")).toEqual([]);
  });

  it("excludes the tab a scoped mode was opened on", () => {
    expect(ids("saved", "clean")).toEqual([]);
    expect(ids("unsaved", "dirty")).toEqual([]);
    expect(ids("others", "clean")).toEqual(["dirty"]);
  });
});
