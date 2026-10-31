import type { Command } from "$lib/commands/commands";
import { recordCommandUsage } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";

// The registry's `ctrl` prefix means the platform's primary modifier:
// Cmd on macOS, Ctrl elsewhere. Record/press meta on macOS as `ctrl` so the
// ctrl-prefixed default keys match.
const IS_MAC = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

// A dialog is modal for the keyboard too: nothing may run behind it. The find bar is
// not a modal and must keep its shortcuts.
export function isModalOpen(): boolean {
  if (appContext.ui.dialog.isOpen || appContext.ui.dialog.promptIsOpen) return true;
  return Object.entries(appContext.interface).some(
    ([key, open]) => key.startsWith("show") && key !== "showFind" && open === true,
  );
}

// Keys the system or the editor already owns; recording one would break typing.
const RESERVED_CHORDS = new Set([
  "ctrl+a",
  "ctrl+c",
  "ctrl+v",
  "ctrl+x",
  "ctrl+shift+v",
  "ctrl+r",
  "ctrl+shift+i",
  "f12",
]);
const MODIFIER_PARTS = new Set(["ctrl", "alt", "meta"]);

export function isReservedShortcut(key: string): boolean {
  if (RESERVED_CHORDS.has(key)) return true;
  const parts = key.split("+");
  const base = parts[parts.length - 1];
  if (parts.some((part) => MODIFIER_PARTS.has(part))) return false;
  // A bare key would fire while the user is not typing, so only function keys and
  // Escape may stand alone.
  return base !== "escape" && !/^f\d{1,2}$/.test(base);
}

// Stored when another command takes this one's key; "" would fall back to the default.
export const UNBOUND = "none";

export function resolveShortcut(custom: string | undefined, defaultKey: string | undefined): string | undefined {
  if (custom === UNBOUND) return undefined;
  return custom || defaultKey;
}

export class KeyboardShortcutManager {
  private commands: Map<string, Command> = new Map();
  private enabled: boolean = true;

  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  getShortcutDisplay(id: string): string {
    const cmd = this.commands.get(id);
    const customShortcuts = appContext.settings.customShortcuts;
    const key = resolveShortcut(customShortcuts[id], cmd?.defaultKey);
    return this.formatKeyDisplay(key);
  }

  formatKeyDisplay(key: string | undefined): string {
    if (!key) return "";
    return key
      .split("+")
      .map((part) => {
        const label = part.charAt(0).toUpperCase() + part.slice(1);
        return IS_MAC && part === "ctrl" ? "Cmd" : label;
      })
      .join("+");
  }

  getDefinitions(): Command[] {
    return Array.from(this.commands.values());
  }

  findCommandByShortcut(key: string, excludeId?: string): Command | undefined {
    const customShortcuts = appContext.settings.customShortcuts;
    const normalizedKey = key.toLowerCase();
    for (const cmd of this.commands.values()) {
      if (cmd.id === excludeId) continue;
      const mappedKey = resolveShortcut(customShortcuts[cmd.id], cmd.defaultKey);
      if (mappedKey && mappedKey.toLowerCase() === normalizedKey) {
        return cmd;
      }
    }
    return undefined;
  }

  getShortcutsByCategory(): Map<string, Command[]> {
    const grouped = new Map<string, Command[]>();
    for (const cmd of this.commands.values()) {
      if (!grouped.has(cmd.category)) {
        grouped.set(cmd.category, []);
      }
      grouped.get(cmd.category)?.push(cmd);
    }
    return grouped;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async handleKeyEvent(e: KeyboardEvent): Promise<boolean> {
    if (!this.enabled || e.repeat || isModalOpen()) return false;

    const pressedKey = this.getEventKey(e);
    const isInput = this.isInputElement(e.target);
    const customShortcuts = appContext.settings.customShortcuts;

    for (const cmd of this.commands.values()) {
      const mappedKey = resolveShortcut(customShortcuts[cmd.id], cmd.defaultKey);
      if (!mappedKey || !cmd.handler) continue;
      if (pressedKey === mappedKey.toLowerCase()) {
        // Custom keys obey the same input guard as defaults; the editor's own keymap
        // covers commands that must fire while the editor (a contenteditable) has focus.
        if (isInput && !cmd.global) {
          continue;
        }
        // Only an explicit `false` means "let the key through"; void/async handlers
        // still consume it. Prevent before the handler can await, or the default
        // action of the key has already run.
        const result = cmd.handler(e);
        if (result === false) return false;
        recordCommandUsage(cmd.id);
        e.preventDefault();
        e.stopPropagation();
        await result;
        return true;
      }
    }

    return false;
  }

  private isInputElement(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    const isInput = tagName === "input" || tagName === "textarea" || tagName === "select";
    const isContentEditable = target.isContentEditable;
    const hasInputRole =
      target.getAttribute("role") === "textbox" ||
      target.getAttribute("role") === "searchbox" ||
      target.getAttribute("role") === "combobox";
    return isInput || isContentEditable || hasInputRole;
  }

  getEventKey(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (IS_MAC) {
      if (e.metaKey || e.ctrlKey) parts.push("ctrl");
    } else {
      if (e.ctrlKey) parts.push("ctrl");
      if (e.metaKey) parts.push("meta");
    }
    if (e.altKey) parts.push("alt");
    if (e.shiftKey) parts.push("shift");
    let key = e.key.toLowerCase();
    if (key === " ") key = "space";
    if (!["control", "shift", "alt", "meta"].includes(key)) {
      parts.push(key);
    }
    return parts.join("+");
  }
}

export const shortcutManager = new KeyboardShortcutManager();
