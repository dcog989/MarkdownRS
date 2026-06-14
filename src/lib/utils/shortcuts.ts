import type { Command } from '$lib/commands/commands';

export class KeyboardShortcutManager {
  private commands: Map<string, Command> = new Map();
  private customMappings: Record<string, string> = {};
  private enabled: boolean = true;

  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  setCustomMappings(mappings: Record<string, string>): void {
    this.customMappings = mappings;
  }

  getShortcutDisplay(id: string): string {
    const cmd = this.commands.get(id);
    const key = this.customMappings[id] || cmd?.defaultKey;
    if (!key) return '';
    return key
      .split('+')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('+');
  }

  getDefinitions(): Command[] {
    return Array.from(this.commands.values());
  }

  findCommandByShortcut(key: string, excludeId?: string): Command | undefined {
    const normalizedKey = key.toLowerCase();
    for (const cmd of this.commands.values()) {
      if (cmd.id === excludeId) continue;
      const mappedKey = this.customMappings[cmd.id] || cmd.defaultKey;
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

  clear(): void {
    this.commands.clear();
  }

  isRegistered(id: string): boolean {
    return this.commands.has(id);
  }

  async handleKeyEvent(e: KeyboardEvent): Promise<boolean> {
    if (!this.enabled || e.repeat) return false;

    const pressedKey = this.getEventKey(e);

    const globalShortcuts = [
      'ctrl+p',
      'ctrl+shift+p',
      'ctrl+s',
      'ctrl+shift+s',
      'ctrl+o',
      'ctrl+n',
      'ctrl+w',
      'ctrl+shift+t',
      'ctrl+tab',
      'ctrl+shift+tab',
      'ctrl+pagedown',
      'ctrl+pageup',
      'ctrl+,',
      'ctrl+t',
      'ctrl+shift+b',
      'ctrl+\\',
      'ctrl+f',
      'ctrl+h',
      'f1',
      'f11',
      'escape',
    ];

    const isInput = this.isInputElement(e.target);

    for (const cmd of this.commands.values()) {
      const mappedKey = this.customMappings[cmd.id] || cmd.defaultKey;
      if (!mappedKey || !cmd.handler) continue;
      if (pressedKey === mappedKey.toLowerCase()) {
        if (isInput && !(cmd.id in this.customMappings) && !globalShortcuts.includes(pressedKey)) {
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

  private getEventKey(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    if (e.metaKey) parts.push('meta');
    let key = e.key.toLowerCase();
    if (key === ' ') key = 'space';
    if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
      parts.push(key);
    }
    return parts.join('+');
  }
}

export const shortcutManager = new KeyboardShortcutManager();
