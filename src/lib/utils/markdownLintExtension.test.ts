import { describe, expect, it } from "vitest";
import { columnToCodeUnits } from "$lib/utils/markdownLintExtension.svelte";
import { SPELLCHECK_WORD_PATTERN, stripPossessiveSuffix } from "$lib/utils/spellcheck.svelte";

describe("columnToCodeUnits", () => {
  it("turns a 1-based character column into a code-unit offset", () => {
    expect(columnToCodeUnits("hello", 1)).toBe(0);
    expect(columnToCodeUnits("hello", 3)).toBe(2);
  });

  it("counts an astral character as two code units", () => {
    // "😀" is one character but two UTF-16 code units, so the text after it
    // moves by two.
    expect(columnToCodeUnits("😀ab", 2)).toBe(2);
    expect(columnToCodeUnits("😀ab", 3)).toBe(3);
  });
});

describe("SPELLCHECK_WORD_PATTERN", () => {
  it("keeps accented and non-latin words whole", () => {
    expect("Grüße".match(SPELLCHECK_WORD_PATTERN)).toEqual(["Grüße"]);
    expect("café".match(SPELLCHECK_WORD_PATTERN)).toEqual(["café"]);
    expect("καλημέρα".match(SPELLCHECK_WORD_PATTERN)).toEqual(["καλημέρα"]);
  });

  it("keeps inner apostrophes and ignores identifier fragments", () => {
    expect("don’t".match(SPELLCHECK_WORD_PATTERN)).toEqual(["don’t"]);
    expect("don't".match(SPELLCHECK_WORD_PATTERN)).toEqual(["don't"]);
    expect("snake_case".match(SPELLCHECK_WORD_PATTERN)).toBeNull();
  });
});

describe("stripPossessiveSuffix", () => {
  it("strips straight and typographic possessives", () => {
    expect(stripPossessiveSuffix("Bob's")).toBe("Bob");
    expect(stripPossessiveSuffix("Bob’s")).toBe("Bob");
    expect(stripPossessiveSuffix("Bob")).toBe("Bob");
  });
});
