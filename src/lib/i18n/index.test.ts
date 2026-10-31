import { describe, expect, it } from "vitest";
import { resolveLocale } from "$lib/i18n";

describe("resolveLocale", () => {
  it("keeps a supported locale and normalizes a regional variant", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("en-US")).toBe("en");
  });

  it("falls back to the system locale for unknown values", () => {
    expect(resolveLocale("de-DE")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });

  it("resolves the system sentinel", () => {
    expect(resolveLocale("system")).toBe("en");
  });
});
