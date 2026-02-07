/**
 * Debounce utility functions
 */

export interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
    (...args: Parameters<T>): void;
    clear: () => void;
}

/**
 * Creates a debounced version of a function
 * @param fn Function to debounce
 * @param delay Delay in milliseconds
 * @returns Debounced function with a .clear() method
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
): DebouncedFunction<T> {
    let timeout: number | null = null;

    const debounced = (...args: Parameters<T>) => {
        if (timeout !== null) {
            clearTimeout(timeout);
        }
        timeout = window.setTimeout(() => {
            fn(...args);
            timeout = null;
        }, delay);
    };

    debounced.clear = () => {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
    };

    return debounced;
}

export interface ThrottleOptions {
    leading?: boolean; // Fire on the leading edge (first call)
    trailing?: boolean; // Fire on the trailing edge (last call after interval)
}

/**
 * Creates a throttled version of a function
 * Ensures function is called at most once per specified interval
 * @param fn Function to throttle
 * @param interval Minimum interval between calls in milliseconds
 * @param options Throttle behavior options (default: { leading: false, trailing: true })
 * @returns Throttled function with .clear() method
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => any>(
    fn: T,
    interval: number,
    options: ThrottleOptions = {},
): DebouncedFunction<T> {
    const { leading = false, trailing = true } = options;
    let lastCall = 0;
    let timeout: number | null = null;
    let lastArgs: Parameters<T> | null = null;

    const invoke = (args: Parameters<T>) => {
        lastCall = Date.now();
        fn(...args);
        lastArgs = null;
    };

    const throttled = (...args: Parameters<T>) => {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;
        lastArgs = args;

        // Clear any pending timeout
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }

        if (timeSinceLastCall >= interval) {
            // Interval has passed - can invoke now
            if (leading) {
                invoke(args);
            } else if (trailing) {
                // Schedule trailing call
                timeout = window.setTimeout(() => {
                    if (lastArgs) {
                        invoke(lastArgs);
                    }
                    timeout = null;
                }, interval);
            }
        } else if (trailing) {
            // Within interval - schedule trailing call
            timeout = window.setTimeout(() => {
                if (lastArgs) {
                    invoke(lastArgs);
                }
                timeout = null;
            }, interval - timeSinceLastCall);
        }
    };

    throttled.clear = () => {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
        lastArgs = null;
    };

    return throttled;
}

/**
 * Delays execution until the next animation frame
 * Useful for UI updates that should sync with browser rendering
 * @param fn Function to execute
 * @returns Cancellation function
 */
export function nextFrame(fn: () => void): () => void {
    const handle = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(handle);
}

/**
 * Creates a cancelable timeout
 * @param fn Function to execute
 * @param delay Delay in milliseconds
 * @returns Cancellation function
 */
export function createTimeout(fn: () => void, delay: number): () => void {
    const timeout = window.setTimeout(fn, delay);
    return () => clearTimeout(timeout);
}

/**
 * Creates a managed timer that can be easily cleaned up
 */
export class ManagedTimer {
    private timeout: number | null = null;

    set(fn: () => void, delay: number): void {
        this.clear();
        this.timeout = window.setTimeout(() => {
            fn();
            this.timeout = null;
        }, delay);
    }

    clear(): void {
        if (this.timeout !== null) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }

    isActive(): boolean {
        return this.timeout !== null;
    }
}
