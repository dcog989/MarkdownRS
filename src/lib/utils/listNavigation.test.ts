import { describe, expect, it, vi } from "vitest";
import { createListNavigation } from "./listNavigation.svelte";

const items = ["a", "b", "c"];

function press(nav: ReturnType<typeof createListNavigation>, key: string) {
  const preventDefault = vi.fn();
  nav.handleKeydown({ key, preventDefault } as unknown as KeyboardEvent);
  return preventDefault;
}

function create(onEnter = vi.fn()) {
  return { nav: createListNavigation(() => items.length, onEnter), onEnter };
}

describe("createListNavigation", () => {
  it("leaves left and right to the text field", () => {
    const { nav } = create();

    expect(press(nav, "ArrowRight")).not.toHaveBeenCalled();
    expect(press(nav, "ArrowLeft")).not.toHaveBeenCalled();
    expect(nav.selectedIndex).toBe(0);
  });

  it("moves, wraps, pages and enters", () => {
    const { nav, onEnter } = create();

    press(nav, "ArrowDown");
    expect(nav.selectedIndex).toBe(1);

    press(nav, "ArrowUp");
    expect(nav.selectedIndex).toBe(0);

    press(nav, "ArrowUp");
    expect(nav.selectedIndex).toBe(2);

    press(nav, "PageUp");
    expect(nav.selectedIndex).toBe(0);

    press(nav, "PageDown");
    expect(nav.selectedIndex).toBe(2);

    press(nav, "Enter");
    expect(onEnter).toHaveBeenCalledWith(2);
  });

  it("ignores navigation on an empty list", () => {
    const empty = createListNavigation(() => 0, vi.fn());

    expect(press(empty, "ArrowDown")).not.toHaveBeenCalled();
    expect(empty.selectedIndex).toBe(0);
  });
});
