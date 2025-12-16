/**
 * Async utilities for managing timers and rate limiting
 * Note: Deprecated - Use timing.ts instead for debounce/throttle
 * This file is kept only for backward compatibility with TimerManager
 */

/**
 * Creates a timer manager for handling multiple timeouts/intervals
 */
export class TimerManager {
    private timers: Map<string, number> = new Map();
    private intervals: Map<string, number> = new Map();

    setTimeout(key: string, callback: () => void, delay: number): void {
        this.clearTimeout(key);
        const id = window.setTimeout(() => {
            callback();
            this.timers.delete(key);
        }, delay);
        this.timers.set(key, id);
    }

    setInterval(key: string, callback: () => void, delay: number): void {
        this.clearInterval(key);
        const id = window.setInterval(callback, delay);
        this.intervals.set(key, id);
    }

    clearTimeout(key: string): void {
        const id = this.timers.get(key);
        if (id !== undefined) {
            clearTimeout(id);
            this.timers.delete(key);
        }
    }

    clearInterval(key: string): void {
        const id = this.intervals.get(key);
        if (id !== undefined) {
            clearInterval(id);
            this.intervals.delete(key);
        }
    }

    clearAll(): void {
        this.timers.forEach((id) => clearTimeout(id));
        this.intervals.forEach((id) => clearInterval(id));
        this.timers.clear();
        this.intervals.clear();
    }
}

// Re-export from timing.ts to maintain compatibility
export { debounce, throttle } from './timing';
