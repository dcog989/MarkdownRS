/**
 * Shared scroll synchronization utilities
 */

export interface ScrollSyncState {
    isRemoteScrolling: boolean;
    lockTimeout: number | null;
}

export function createScrollSyncState(): ScrollSyncState {
    return {
        isRemoteScrolling: false,
        lockTimeout: null,
    };
}

/**
 * Calculate scroll percentage from DOM element
 */
export function getScrollPercentage(element: HTMLElement): number {
    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) return 0;

    let percentage = element.scrollTop / maxScroll;

    // Handle edge cases
    if (element.scrollTop <= 1) percentage = 0;
    else if (Math.abs(element.scrollTop - maxScroll) <= 1) percentage = 1;

    return Math.max(0, Math.min(1, percentage));
}

/**
 * Cleanup scroll sync state
 */
export function cleanupScrollSync(state: ScrollSyncState): void {
    if (state.lockTimeout) {
        clearTimeout(state.lockTimeout);
        state.lockTimeout = null;
    }
    state.isRemoteScrolling = false;
}
