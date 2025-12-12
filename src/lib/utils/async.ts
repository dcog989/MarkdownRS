/**
 * Debounce utility for delaying function execution
 * Prevents excessive function calls during rapid events
 */

type DebounceFunction = (...args: any[]) => void;

export function debounce<T extends DebounceFunction>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: number | null = null;

    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout !== null) {
            clearTimeout(timeout);
        }

        timeout = window.setTimeout(later, wait);
    };
}

/**
 * Throttle utility for rate-limiting function execution
 * Ensures function is called at most once per specified interval
 */
export function throttle<T extends DebounceFunction>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;

    return function executedFunction(...args: Parameters<T>) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

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
