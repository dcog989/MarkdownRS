import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "$lib/commands/commands";
import { appContext } from "$lib/stores/state.svelte";
import { isReservedShortcut, KeyboardShortcutManager, resolveShortcut, UNBOUND } from "./shortcuts";

function keydown(key: string, init: KeyboardEventInit = {}, target?: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target?.dispatchEvent(event);
  return event;
}

function command(id: string, overrides: Partial<Command> = {}): Command {
  return { id, label: id, category: "test", ...overrides };
}

describe("resolveShortcut", () => {
  it("prefers a custom key and treats a taken one as unbound", () => {
    expect(resolveShortcut("ctrl+alt+k", "ctrl+k")).toBe("ctrl+alt+k");
    expect(resolveShortcut(undefined, "ctrl+k")).toBe("ctrl+k");
    expect(resolveShortcut(UNBOUND, "ctrl+k")).toBeUndefined();
  });
});

describe("isReservedShortcut", () => {
  it("rejects editing chords and bare keys", () => {
    expect(isReservedShortcut("ctrl+a")).toBe(true);
    expect(isReservedShortcut("tab")).toBe(true);
    expect(isReservedShortcut("a")).toBe(true);
  });

  it("allows modified chords and the app's own bare keys", () => {
    expect(isReservedShortcut("ctrl+alt+k")).toBe(false);
    expect(isReservedShortcut("f8")).toBe(false);
    expect(isReservedShortcut("escape")).toBe(false);
  });
});

describe("KeyboardShortcutManager", () => {
  let manager: KeyboardShortcutManager;
  let input: HTMLInputElement;

  beforeEach(() => {
    manager = new KeyboardShortcutManager();
    input = document.createElement("input");
    document.body.appendChild(input);
  });

  afterEach(() => {
    input.remove();
    appContext.settings.customShortcuts = {};
    appContext.interface.showSettings = false;
    appContext.ui.dialog.isOpen = false;
  });

  it("runs a command on its default key and consumes the event", async () => {
    const handler = vi.fn();
    manager.register(command("test.save", { defaultKey: "ctrl+s", handler }));

    const event = keydown("s", { ctrlKey: true });

    await expect(manager.handleKeyEvent(event)).resolves.toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("uses the custom key instead of the default", async () => {
    const handler = vi.fn();
    manager.register(command("test.save", { defaultKey: "ctrl+s", handler }));
    appContext.settings.customShortcuts["test.save"] = "ctrl+alt+k";

    await manager.handleKeyEvent(keydown("s", { ctrlKey: true }));
    expect(handler).not.toHaveBeenCalled();

    await expect(manager.handleKeyEvent(keydown("k", { ctrlKey: true, altKey: true }))).resolves.toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("skips a non-global command while an input has focus", async () => {
    const handler = vi.fn();
    manager.register(command("test.edit", { defaultKey: "ctrl+e", handler }));

    await expect(manager.handleKeyEvent(keydown("e", { ctrlKey: true }, input))).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs a global command while an input has focus", async () => {
    const handler = vi.fn();
    manager.register(command("test.global", { defaultKey: "ctrl+e", global: true, handler }));

    await expect(manager.handleKeyEvent(keydown("e", { ctrlKey: true }, input))).resolves.toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does nothing while a modal is open", async () => {
    const handler = vi.fn();
    manager.register(command("test.save", { defaultKey: "ctrl+s", handler }));
    appContext.interface.showSettings = true;

    await expect(manager.handleKeyEvent(keydown("s", { ctrlKey: true }))).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets the key through when the handler returns false", async () => {
    manager.register(command("test.pass", { defaultKey: "f5", handler: () => false }));

    const event = keydown("F5");

    await expect(manager.handleKeyEvent(event)).resolves.toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it("spells named keys from the shared table", () => {
    expect(manager.formatKeyDisplay("alt+arrowup")).toBe("Alt+ArrowUp");
    expect(manager.formatKeyDisplay("ctrl+pagedown")).toContain("PageDown");
  });
});
