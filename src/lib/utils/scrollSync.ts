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
    if (element.scrollTop <= 2) percentage = 0;
    else if (Math.abs(element.scrollTop - maxScroll) <= 2) percentage = 1;

    return Math.max(0, Math.min(1, percentage));
}

/**
 * Apply scroll percentage to DOM element
 */
export function setScrollPercentage(
    element: HTMLElement,
    percentage: number,
    state: ScrollSyncState,
    lockDuration: number = 50
): void {
    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) return;

    const targetScroll = Math.round(maxScroll * percentage);
    const currentScroll = element.scrollTop;

    // Only sync if difference is significant (>1% of total scroll)
    if (Math.abs(currentScroll - targetScroll) > maxScroll * 0.01) {
        state.isRemoteScrolling = true;
        element.scrollTop = targetScroll;

        // Release lock after scroll event has fired
        if (state.lockTimeout) clearTimeout(state.lockTimeout);
        state.lockTimeout = window.setTimeout(() => {
            state.isRemoteScrolling = false;
        }, lockDuration);
    }
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
