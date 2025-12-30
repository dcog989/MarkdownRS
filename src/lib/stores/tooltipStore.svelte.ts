// State
export const tooltipStore = $state({
    visible: false,
    content: "",
    x: 0,
    y: 0,
});

// Logic
export function showTooltip(content: string, x: number, y: number) {
    tooltipStore.content = content;
    tooltipStore.x = x;
    tooltipStore.y = y;
    tooltipStore.visible = true;
}

export function hideTooltip() {
    tooltipStore.visible = false;
}
