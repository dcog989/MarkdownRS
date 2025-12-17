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
 * Apply scroll percentage to DOM element with smooth animation
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

    // Sync if difference is greater than 1 pixel (removes "steppiness" of 1% threshold)
    if (Math.abs(currentScroll - targetScroll) > 1) {
        state.isRemoteScrolling = true;

        // Use smooth scrollTo for animated transitions
        element.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
        });

        // Release lock after scroll event has fired
        if (state.lockTimeout) clearTimeout(state.lockTimeout);
        state.lockTimeout = window.setTimeout(() => {
            state.isRemoteScrolling = false;
        }, lockDuration);
    }
}

/**
 * Scroll to a specific position with smooth animation
 */
export function smoothScrollTo(
    element: HTMLElement,
    targetScroll: number,
    duration: number = 200
): Promise<void> {
    return new Promise((resolve) => {
        const startScroll = element.scrollTop;
        const distance = targetScroll - startScroll;
        let startTime: number | null = null;

        function animation(currentTime: number) {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            
            // Ease-in-out cubic for smooth motion
            const easing = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            element.scrollTop = startScroll + distance * easing;

            if (progress < 1) {
                requestAnimationFrame(animation);
            } else {
                resolve();
            }
        }

        requestAnimationFrame(animation);
    });
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
