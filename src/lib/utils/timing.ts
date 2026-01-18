/**
 * Debounce utility functions
 */

/**
 * Creates a debounced version of a function
 * @param fn Function to debounce
 * @param delay Delay in milliseconds
 * @returns Debounced function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
): (...args: Parameters<T>) => void {
    let timeout: number | null = null;

    return (...args: Parameters<T>) => {
        if (timeout !== null) {
            clearTimeout(timeout);
        }
        timeout = window.setTimeout(() => {
            fn(...args);
            timeout = null;
        }, delay);
    };
}

/**
 * Creates a throttled version of a function
 * Ensures function is called at most once per specified interval
 * @param fn Function to throttle
 * @param interval Minimum interval between calls in milliseconds
 * @returns Throttled function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => any>(
    fn: T,
    interval: number,
): (...args: Parameters<T>) => void {
    let lastCall = 0;
    let timeout: number | null = null;

    return (...args: Parameters<T>) => {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;

        if (timeSinceLastCall >= interval) {
            lastCall = now;
            fn(...args);
        } else {
            // Schedule for the end of the interval
            if (timeout !== null) {
                clearTimeout(timeout);
            }
            timeout = window.setTimeout(() => {
                lastCall = Date.now();
                fn(...args);
                timeout = null;
            }, interval - timeSinceLastCall);
        }
    };
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
