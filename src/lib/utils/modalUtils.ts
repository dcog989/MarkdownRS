/**
 * Svelte action to scroll an element into view when it becomes selected
 */
export function scrollIntoView(node: HTMLElement, isSelected: boolean) {
    if (isSelected) {
        node.scrollIntoView({ block: 'nearest' });
    }
    return {
        update(newIsSelected: boolean) {
            if (newIsSelected) {
                node.scrollIntoView({ block: 'nearest' });
            }
        },
    };
}

/**
 * Debounce function for delaying execution
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number,
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}
