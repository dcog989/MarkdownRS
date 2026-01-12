import type { EditorView } from '@codemirror/view';

/**
 * Manages scroll position capture and restoration for CodeMirror editor views
 */
export class ScrollManager {
    private savedScrollTop: number = 0;
    private savedScrollLeft: number = 0;

    /**
     * Captures the current scroll position of the editor
     * @param view - The CodeMirror EditorView instance
     * @param context - Optional context string for debugging
     */
    capture(view: EditorView, context?: string): void {
        const dom = view.scrollDOM;
        this.savedScrollTop = dom.scrollTop;
        this.savedScrollLeft = dom.scrollLeft;
    }

    /**
     * Restores the previously captured scroll position
     * @param view - The CodeMirror EditorView instance
     * @param mode - How to restore: "pixel" for exact position, "percentage" for relative position
     */
    restore(view: EditorView, mode: 'pixel' | 'percentage' = 'pixel'): void {
        const dom = view.scrollDOM;

        if (mode === 'pixel') {
            dom.scrollTop = this.savedScrollTop;
            dom.scrollLeft = this.savedScrollLeft;
        } else if (mode === 'percentage') {
            const maxTop = dom.scrollHeight - dom.clientHeight;
            const maxLeft = dom.scrollWidth - dom.clientWidth;

            if (maxTop > 0) {
                const percentage = this.savedScrollTop / maxTop;
                dom.scrollTop = percentage * maxTop;
            }
            if (maxLeft > 0) {
                const percentage = this.savedScrollLeft / maxLeft;
                dom.scrollLeft = percentage * maxLeft;
            }
        }
    }

    /**
     * Resets the saved scroll position to zero
     */
    reset(): void {
        this.savedScrollTop = 0;
        this.savedScrollLeft = 0;
    }
}
