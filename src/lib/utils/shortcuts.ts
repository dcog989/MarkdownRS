import type { Command } from '$lib/commands/commands';
import { appContext } from '$lib/stores/state.svelte';

// The registry's `ctrl` prefix means the platform's primary modifier:
// Cmd on macOS, Ctrl elsewhere. Record/press meta on macOS as `ctrl` so the
// ctrl-prefixed default keys match.
const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

export class KeyboardShortcutManager {
  private commands: Map<string, Command> = new Map();
  private enabled: boolean = true;

  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  getShortcutDisplay(id: string): string {
    const cmd = this.commands.get(id);
    const customShortcuts = appContext.settings.customShortcuts;
    const key = customShortcuts[id] || cmd?.defaultKey;
    if (!key) return '';
    return key
      .split('+')
      .map((part) => {
        const label = part.charAt(0).toUpperCase() + part.slice(1);
        return IS_MAC && part === 'ctrl' ? 'Cmd' : label;
      })
      .join('+');
  }

  getDefinitions(): Command[] {
    return Array.from(this.commands.values());
  }

  findCommandByShortcut(key: string, excludeId?: string): Command | undefined {
    const customShortcuts = appContext.settings.customShortcuts;
    const normalizedKey = key.toLowerCase();
    for (const cmd of this.commands.values()) {
      if (cmd.id === excludeId) continue;
      const mappedKey = customShortcuts[cmd.id] || cmd.defaultKey;
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
    if (!this.enabled || e.repeat) return false;

    const pressedKey = this.getEventKey(e);
    const isInput = this.isInputElement(e.target);
    const customShortcuts = appContext.settings.customShortcuts;

    for (const cmd of this.commands.values()) {
      const mappedKey = customShortcuts[cmd.id] || cmd.defaultKey;
      if (!mappedKey || !cmd.handler) continue;
      if (pressedKey === mappedKey.toLowerCase()) {
        if (isInput && !(cmd.id in customShortcuts) && !cmd.global) {
          continue;
        }
        const result = await cmd.handler(e);
        if (result === true) {
          e.preventDefault();
          e.stopPropagation();
          return true;
        }
        return false;
      }
    }

    return false;
  }

  private isInputElement(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    const isContentEditable = target.isContentEditable;
    const hasInputRole =
      target.getAttribute('role') === 'textbox' ||
      target.getAttribute('role') === 'searchbox' ||
      target.getAttribute('role') === 'combobox';
    return isInput || isContentEditable || hasInputRole;
  }

  getEventKey(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (IS_MAC) {
      if (e.metaKey || e.ctrlKey) parts.push('ctrl');
    } else {
      if (e.ctrlKey) parts.push('ctrl');
      if (e.metaKey) parts.push('meta');
    }
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    let key = e.key.toLowerCase();
    if (key === ' ') key = 'space';
    if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
      parts.push(key);
    }
    return parts.join('+');
  }
}

export const shortcutManager = new KeyboardShortcutManager();
