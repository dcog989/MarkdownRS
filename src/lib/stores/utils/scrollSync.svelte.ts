import { EditorView } from "@codemirror/view";
import { tick } from "svelte";

class ScrollSyncManager {
    private editorView: EditorView | null = null;
    private previewEl: HTMLElement | null = null;
    private lineMap = $state<{ line: number; y: number }[]>([]);

    // Internal flag to block recursive sync updates
    private isLocked = false;

    registerEditor(view: EditorView) {
        this.editorView = view;
    }

    registerPreview(el: HTMLElement) {
        this.previewEl = el;
    }

    async updateMap() {
        if (!this.previewEl) return;
        await tick();

        const containerRect = this.previewEl.getBoundingClientRect();
        const elements = Array.from(this.previewEl.querySelectorAll("[data-source-line]")) as HTMLElement[];

        this.lineMap = elements.map(el => {
            const rect = el.getBoundingClientRect();
            return {
                line: parseInt(el.getAttribute("data-source-line") || "1", 10),
                y: rect.top - containerRect.top + this.previewEl!.scrollTop
            };
        }).sort((a, b) => a.line - b.line);

        if (this.lineMap.length > 0 && this.lineMap[0].line > 1) {
            this.lineMap.unshift({ line: 1, y: 0 });
        }
    }

    syncPreviewToEditor() {
        if (this.isLocked || !this.editorView || !this.previewEl || this.lineMap.length === 0) return;

        const dom = this.editorView.scrollDOM;
        const scrollTop = dom.scrollTop;
        const scrollHeight = dom.scrollHeight - dom.clientHeight;
        if (scrollHeight <= 0) return;

        // 1. Calculate fractional line at editor top
        const lineBlock = this.editorView.lineBlockAtHeight(scrollTop);
        const lineNum = this.editorView.state.doc.lineAt(lineBlock.from).number;
        const fraction = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
        const targetLine = lineNum + fraction;

        // 2. Interpolate Y position in preview
        const maxScroll = this.previewEl.scrollHeight - this.previewEl.clientHeight;
        const percentage = scrollTop / scrollHeight;

        let targetY = 0;
        if (percentage > 0.99) {
            targetY = maxScroll;
        } else {
            let i = 1;
            for (; i < this.lineMap.length; i++) {
                if (this.lineMap[i].line > targetLine) break;
            }
            const before = this.lineMap[i - 1];
            const after = this.lineMap[i] || before;
            const ratio = after.line === before.line ? 0 : (targetLine - before.line) / (after.line - before.line);

            // p-8 padding is 32px
            targetY = before.y + (after.y - before.y) * ratio - 32;
        }

        if (Math.abs(this.previewEl.scrollTop - targetY) > 1) {
            this.isLocked = true;
            this.previewEl.scrollTop = targetY;
            // Double RAF ensures the programmatic scroll event is processed before unlocking
            requestAnimationFrame(() => {
                requestAnimationFrame(() => { this.isLocked = false; });
            });
        }
    }

    syncEditorToPreview() {
        if (this.isLocked || !this.editorView || !this.previewEl || this.lineMap.length === 0) return;

        const scrollTop = this.previewEl.scrollTop;
        const scrollHeight = this.previewEl.scrollHeight - this.previewEl.clientHeight;
        if (scrollHeight <= 0) return;

        const effectiveY = scrollTop + 32;

        // 1. Interpolate line number from preview Y
        let i = 1;
        for (; i < this.lineMap.length; i++) {
            if (this.lineMap[i].y > effectiveY) break;
        }
        const before = this.lineMap[i - 1];
        const after = this.lineMap[i] || before;
        const ratio = after.y === before.y ? 0 : (effectiveY - before.y) / (after.y - before.y);
        const targetLine = before.line + (after.line - before.line) * ratio;

        // 2. Align editor to that fractional line
        const dom = this.editorView.scrollDOM;
        const percentage = scrollTop / scrollHeight;
        let targetEditorY = 0;

        if (percentage > 0.99) {
            targetEditorY = dom.scrollHeight - dom.clientHeight;
        } else {
            const lineInt = Math.floor(targetLine);
            const lineFraction = targetLine - lineInt;
            const docLines = this.editorView.state.doc.lines;
            const lineBlock = this.editorView.lineBlockAt(this.editorView.state.doc.line(Math.max(1, Math.min(lineInt, docLines))).from);

            targetEditorY = lineBlock.top + (lineBlock.height * lineFraction);
        }

        if (Math.abs(dom.scrollTop - targetEditorY) > 1) {
            this.isLocked = true;
            dom.scrollTop = targetEditorY;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => { this.isLocked = false; });
            });
        }
    }
}

export const scrollSync = new ScrollSyncManager();
