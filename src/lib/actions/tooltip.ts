import { appState } from "$lib/stores/appState.svelte.ts";
import { tooltipStore } from "$lib/stores/tooltipStore.svelte.ts";

export function tooltip(node: HTMLElement, content: string | undefined | null) {
    let timer: number | null = null;

    function handleMouseEnter(e: MouseEvent) {
        if (!content) return;

        const delay = appState.tooltipDelay;
        const x = e.clientX;
        const y = e.clientY;

        timer = window.setTimeout(() => {
            tooltipStore.show(content!, x, y);
        }, delay);
    }

    function handleMouseLeave() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        tooltipStore.hide();
    }

    function handleMouseDown() {
        handleMouseLeave();
    }

    node.addEventListener("mouseenter", handleMouseEnter);
    node.addEventListener("mouseleave", handleMouseLeave);
    node.addEventListener("mousedown", handleMouseDown);

    return {
        update(newContent: string | undefined | null) {
            content = newContent;
            if (!content && timer) {
                handleMouseLeave();
            }
            if (tooltipStore.visible && content) {
                tooltipStore.content = content;
            }
        },
        destroy() {
            node.removeEventListener("mouseenter", handleMouseEnter);
            node.removeEventListener("mouseleave", handleMouseLeave);
            node.removeEventListener("mousedown", handleMouseDown);
            if (timer) clearTimeout(timer);
        }
    };
}
