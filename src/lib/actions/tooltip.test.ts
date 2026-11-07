import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tooltipStore } from "$lib/stores/tooltipStore.svelte";
import { cancelPendingTooltips, tooltip } from "./tooltip";

const ADVANCE_PAST_DELAY_MS = 5000;

function hover(node: HTMLElement) {
  node.dispatchEvent(new MouseEvent("mouseenter", { clientX: 1, clientY: 1 }));
}

function mountTooltip() {
  const node = document.createElement("button");
  document.body.appendChild(node);
  return { node, action: tooltip(node, "Show File Tree") };
}

describe("tooltip action", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tooltipStore.visible = false;
  });

  afterEach(() => {
    cancelPendingTooltips();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("does not show while the window is unfocused", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { node, action } = mountTooltip();

    hover(node);
    vi.advanceTimersByTime(ADVANCE_PAST_DELAY_MS);

    expect(tooltipStore.visible).toBe(false);
    action.destroy();
  });

  it("does not show after the window-exit cleanup", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { node, action } = mountTooltip();

    hover(node);
    cancelPendingTooltips();
    vi.advanceTimersByTime(ADVANCE_PAST_DELAY_MS);

    expect(tooltipStore.visible).toBe(false);
    action.destroy();
  });

  it("shows while the window is focused", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { node, action } = mountTooltip();

    hover(node);
    vi.advanceTimersByTime(ADVANCE_PAST_DELAY_MS);

    expect(tooltipStore.visible).toBe(true);
    action.destroy();
  });
});
