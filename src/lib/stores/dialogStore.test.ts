import { beforeEach, describe, expect, it } from "vitest";
import { dialogStore, promptDialog, resolvePrompt } from "./dialogStore.svelte";

describe("promptDialog", () => {
  beforeEach(() => {
    while (dialogStore.promptIsOpen) resolvePrompt(null);
  });

  it("queues a second prompt instead of dropping the first request", async () => {
    const first = promptDialog({ title: "First" });
    const second = promptDialog({ title: "Second" });

    expect(dialogStore.promptOptions.title).toBe("First");

    resolvePrompt("one");
    await expect(first).resolves.toBe("one");
    expect(dialogStore.promptOptions.title).toBe("Second");

    resolvePrompt("two");
    await expect(second).resolves.toBe("two");
    expect(dialogStore.promptIsOpen).toBe(false);
  });

  it("does nothing when no prompt is pending", () => {
    expect(() => resolvePrompt(null)).not.toThrow();
    expect(dialogStore.promptIsOpen).toBe(false);
  });
});
