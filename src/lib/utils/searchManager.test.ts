import { beforeEach, describe, expect, it } from "vitest";
import { buildSearchRegex, countMatches, searchAllTabs, searchState } from "./searchManager.svelte";

function requireRegex(): RegExp {
  const regex = buildSearchRegex();
  if (!regex) throw new Error("expected buildSearchRegex to return a regex");
  return regex;
}

describe("buildSearchRegex", () => {
  beforeEach(() => {
    searchState.findText = "";
    searchState.useRegex = false;
    searchState.matchCase = false;
    searchState.matchWholeWord = false;
    searchState.regexError = null;
  });

  it("treats metacharacters as literal text in plain mode", () => {
    searchState.findText = "a.b*";
    const regex = requireRegex();
    expect("a.b* here".match(regex)).toHaveLength(1);
    expect("axbb here".match(regex)).toBeNull();
  });

  it("keeps whole-word boundaries around every alternative in regex mode", () => {
    searchState.useRegex = true;
    searchState.matchWholeWord = true;
    searchState.findText = "cat|dog";
    const regex = requireRegex();
    expect("a cat and a dog".match(regex)).toEqual(["cat", "dog"]);
    expect("catapult".match(regex)).toBeNull();
    expect("dogma".match(regex)).toBeNull();
  });

  it("is case-insensitive only when match case is off", () => {
    searchState.findText = "note";
    expect("NOTE".match(requireRegex())).not.toBeNull();
    searchState.matchCase = true;
    expect("NOTE".match(requireRegex())).toBeNull();
  });

  it("reports an invalid regex instead of throwing", () => {
    searchState.useRegex = true;
    searchState.findText = "(";
    expect(buildSearchRegex()).toBeNull();
    expect(searchState.regexError).toBeTruthy();
  });
});

describe("countMatches", () => {
  it("counts non-overlapping matches", () => {
    expect(countMatches("aaaa", /aa/g)).toBe(2);
  });

  it("advances past zero-length matches instead of looping", () => {
    expect(countMatches("a\nb\nc", /^/gm)).toBe(3);
  });
});

describe("searchAllTabs", () => {
  it("drops the previous result list when the regex is invalid", () => {
    searchState.findText = "(";
    searchState.useRegex = true;
    searchState.allTabsResults.set("t1", 3);

    searchAllTabs();

    expect(searchState.allTabsResults.size).toBe(0);
  });
});
