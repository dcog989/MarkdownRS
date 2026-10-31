export function formatDuration(startTime: number): string {
  return `${(performance.now() - startTime).toFixed(2)}ms`;
}

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
// biome-ignore lint/suspicious/noExplicitAny: needed for generic function parameter flexibility
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): DebouncedFunction<T> {
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

/**
 * Creates a throttled version of a function
 * Ensures function is called at most once per specified interval, on the
 * trailing edge: the latest call wins.
 * @param fn Function to throttle
 * @param interval Minimum interval between calls in milliseconds
 * @returns Throttled function with .clear() method
 */
// biome-ignore lint/suspicious/noExplicitAny: needed for generic function parameter flexibility
export function throttle<T extends (...args: any[]) => any>(fn: T, interval: number): DebouncedFunction<T> {
  let lastCall = 0;
  let timeout: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const invoke = (args: Parameters<T>) => {
    lastCall = Date.now();
    fn(...args);
    lastArgs = null;
  };

  const throttled = (...args: Parameters<T>) => {
    const timeSinceLastCall = Date.now() - lastCall;
    lastArgs = args;

    // Clear any pending timeout
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }

    timeout = window.setTimeout(
      () => {
        if (lastArgs) {
          invoke(lastArgs);
        }
        timeout = null;
      },
      timeSinceLastCall >= interval ? interval : interval - timeSinceLastCall,
    );
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
