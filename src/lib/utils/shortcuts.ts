/**
 * Centralized Keyboard Shortcut Manager
 * Handles application-wide shortcuts with support for custom remapping.
 */

export type ShortcutHandler = (e: KeyboardEvent) => void | Promise<void>;

export interface ShortcutDefinition {
    id: string; // Unique identifier for the command
    command: string; // Command identifier for remapping logic
    defaultKey: string; // e.g., 'ctrl+s'
    description: string;
    category: string;
    handler?: ShortcutHandler;
}

export class KeyboardShortcutManager {
    private definitions: Map<string, ShortcutDefinition> = new Map();
    private customMappings: Record<string, string> = {};
    private enabled: boolean = true;

    /**
     * Register a shortcut definition
     */
    register(definition: ShortcutDefinition): void {
        this.definitions.set(definition.command, definition);
    }

    /**
     * Set user-defined shortcut mappings
     */
    setCustomMappings(mappings: Record<string, string>): void {
        this.customMappings = mappings;
    }

    /**
     * Unregister a command
     */
    unregister(commandId: string): void {
        this.definitions.delete(commandId);
    }

    /**
     * Check if the event target is an input element where typing should not trigger shortcuts
     */
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

    /**
     * Handle keyboard events by matching against current mappings
     */
    async handleKeyEvent(e: KeyboardEvent): Promise<boolean> {
        if (!this.enabled || e.repeat) return false;

        // Ignore shortcuts when typing in input fields, unless it's an escape key
        if (this.isInputElement(e.target) && e.key !== 'Escape') {
            return false;
        }

        const pressedKey = this.getEventKey(e);

        const isEditorKey = [
            'ctrl+backspace',
            'ctrl+delete',
            'backspace',
            'delete',
            'ctrl+s',
            'ctrl+o',
        ].includes(pressedKey.toLowerCase());

        if (!isEditorKey && e.repeat) return false;

        for (const def of this.definitions.values()) {
            const mappedKey = this.customMappings[def.command] || def.defaultKey;
            if (pressedKey === mappedKey.toLowerCase() && def.handler) {
                e.preventDefault();
                e.stopPropagation();

                // Wrap handler in try-catch to prevent cascading failures
                try {
                    await def.handler(e);
                } catch (err) {
                    console.error(`[Shortcuts] Handler failed for command "${def.command}":`, err);
                    // Re-throw to allow global error handling if needed
                    throw err;
                }
                return true;
            }
        }

        return false;
    }

    /**
     * Get all definitions grouped by category for the UI
     */
    getShortcutsByCategory(): Map<string, ShortcutDefinition[]> {
        const grouped = new Map<string, ShortcutDefinition[]>();
        for (const def of this.definitions.values()) {
            if (!grouped.has(def.category)) {
                grouped.set(def.category, []);
            }
            grouped.get(def.category)!.push(def);
        }
        return grouped;
    }

    /**
     * Get a human-readable display string for a command's current shortcut
     */
    getShortcutDisplay(commandId: string): string {
        const def = this.definitions.get(commandId);
        if (!def) return '';
        const key = this.customMappings[commandId] || def.defaultKey;
        return key
            .split('+')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('+');
    }

    /**
     * Check if a command ID is registered
     */
    isRegistered(commandId: string): boolean {
        return this.definitions.has(commandId);
    }

    /**
     * Enable or disable the manager
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Clear all registered shortcuts
     */
    clear(): void {
        this.definitions.clear();
    }

    /**
     * Get all registered definitions
     */
    getDefinitions(): ShortcutDefinition[] {
        return Array.from(this.definitions.values());
    }

    /**
     * Helper to generate a normalized key string from a keyboard event
     */
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

// Global instance
export const shortcutManager = new KeyboardShortcutManager();
