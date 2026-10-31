import { beforeEach, describe, expect, it } from "vitest";
import { buildSearchRegex, searchState } from "./searchManager.svelte";

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
