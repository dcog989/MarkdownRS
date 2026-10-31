import { beforeEach, describe, expect, it } from "vitest";
import { showToast, toastStore } from "./toastStore.svelte";

describe("showToast", () => {
  beforeEach(() => {
    toastStore.toasts = [];
  });

  it("never throttles errors", () => {
    showToast("error", "Save failed");
    showToast("error", "Save failed");

    expect(toastStore.toasts).toHaveLength(2);
  });

  it("throttles a repeated non-error message", () => {
    showToast("info", "Copied to clipboard");
    showToast("info", "Copied to clipboard");

    expect(toastStore.toasts).toHaveLength(1);
  });
});
