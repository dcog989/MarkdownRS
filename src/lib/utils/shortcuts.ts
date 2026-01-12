/**
 * Centralized Keyboard Shortcut Manager
 * Handles all application-wide keyboard shortcuts
 */

export type ShortcutHandler = (e: KeyboardEvent) => void | Promise<void>;

export interface ShortcutDefinition {
    id: string;
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
    description: string;
    handler: ShortcutHandler;
    category: string;
}

export class KeyboardShortcutManager {
    private shortcuts: Map<string, ShortcutDefinition> = new Map();
    private enabled: boolean = true;

    /**
     * Register a keyboard shortcut
     */
    register(shortcut: ShortcutDefinition): void {
        const key = this.getShortcutKey(shortcut);
        if (this.shortcuts.has(key)) {
            console.warn(`Shortcut ${key} is already registered. Overwriting.`);
        }
        this.shortcuts.set(key, shortcut);
    }

    /**
     * Unregister a keyboard shortcut
     */
    unregister(shortcutOrId: ShortcutDefinition | string): void {
        if (typeof shortcutOrId === 'string') {
            // Remove by ID
            for (const [key, shortcut] of this.shortcuts) {
                if (shortcut.id === shortcutOrId) {
                    this.shortcuts.delete(key);
                    return;
                }
            }
        } else {
            // Remove by shortcut key
            const key = this.getShortcutKey(shortcutOrId);
            this.shortcuts.delete(key);
        }
    }

    /**
     * Handle keyboard event
     */
    async handleKeyEvent(e: KeyboardEvent): Promise<boolean> {
        if (!this.enabled) return false;

        const key = this.getEventKey(e);
        const shortcut = this.shortcuts.get(key);

        if (shortcut) {
            e.preventDefault();
            e.stopPropagation();
            await shortcut.handler(e);
            return true;
        }

        return false;
    }

    /**
     * Get all registered shortcuts grouped by category
     */
    getShortcutsByCategory(): Map<string, ShortcutDefinition[]> {
        const grouped = new Map<string, ShortcutDefinition[]>();

        for (const shortcut of this.shortcuts.values()) {
            const category = shortcut.category;
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category)!.push(shortcut);
        }

        return grouped;
    }

    /**
     * Enable or disable the shortcut manager
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Check if a shortcut is registered
     */
    isRegistered(id: string): boolean {
        for (const shortcut of this.shortcuts.values()) {
            if (shortcut.id === id) return true;
        }
        return false;
    }

    /**
     * Get human-readable shortcut string
     */
    getShortcutString(shortcut: ShortcutDefinition): string {
        const parts: string[] = [];

        if (shortcut.ctrl) parts.push('Ctrl');
        if (shortcut.alt) parts.push('Alt');
        if (shortcut.shift) parts.push('Shift');
        if (shortcut.meta) parts.push('Cmd');

        parts.push(shortcut.key.toUpperCase());

        return parts.join('+');
    }

    /**
     * Generate internal key for shortcut lookup
     */
    private getShortcutKey(shortcut: ShortcutDefinition): string {
        const parts: string[] = [];

        if (shortcut.ctrl) parts.push('ctrl');
        if (shortcut.alt) parts.push('alt');
        if (shortcut.shift) parts.push('shift');
        if (shortcut.meta) parts.push('meta');

        parts.push(shortcut.key.toLowerCase());

        return parts.join('+');
    }

    /**
     * Generate key from keyboard event
     */
    private getEventKey(e: KeyboardEvent): string {
        const parts: string[] = [];

        if (e.ctrlKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        if (e.metaKey) parts.push('meta');

        parts.push(e.key.toLowerCase());

        return parts.join('+');
    }

    /**
     * Clear all shortcuts
     */
    clear(): void {
        this.shortcuts.clear();
    }
}

// Global instance
export const shortcutManager = new KeyboardShortcutManager();
