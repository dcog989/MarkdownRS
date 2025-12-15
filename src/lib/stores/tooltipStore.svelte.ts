export class TooltipStore {
    visible = $state(false);
    content = $state("");
    x = $state(0);
    y = $state(0);

    show(content: string, x: number, y: number) {
        this.content = content;
        this.x = x;
        this.y = y;
        this.visible = true;
    }

    hide() {
        this.visible = false;
    }
}

export const tooltipStore = new TooltipStore();
