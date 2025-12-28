import { appContext } from "$lib/stores/state.svelte.ts";

export function tooltip(node: HTMLElement, content: string | undefined | null) {
    let timer: number | null = null;

    function handleMouseEnter(e: MouseEvent) {
        if (!content) return;

        const delay = appContext.app.tooltipDelay;
        const x = e.clientX;
        const y = e.clientY;

        timer = window.setTimeout(() => {
            appContext.ui.tooltip.show(content!, x, y);
        }, delay);
    }

    function handleMouseLeave() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        appContext.ui.tooltip.hide();
    }

    function handleMouseDown() {
        handleMouseLeave();
    }

    node.addEventListener("mouseenter", handleMouseEnter);
    node.addEventListener("mouseleave", handleMouseLeave);
    node.addEventListener("mousedown", handleMouseDown);

    return {
        update(newContent: string | undefined | null) {
            handleMouseLeave();
            content = newContent;
            if (appContext.ui.tooltip.visible && content) {
                appContext.ui.tooltip.content = content;
            }
        },
        destroy() {
            handleMouseLeave();
            node.removeEventListener("mouseenter", handleMouseEnter);
            node.removeEventListener("mouseleave", handleMouseLeave);
            node.removeEventListener("mousedown", handleMouseDown);
        }
    };
}
