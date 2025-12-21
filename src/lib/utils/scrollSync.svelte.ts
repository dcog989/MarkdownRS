import { EditorView } from "@codemirror/view";
import { tick } from "svelte";

class ScrollSyncManager {
    private editor: EditorView | null = null;
    private preview: HTMLElement | null = null;
    private lineMap: { line: number; y: number }[] = [];
    private isLocked = false;
    private master: 'editor' | 'preview' | null = null;

    registerEditor(view: EditorView) {
        this.editor = view;
        const dom = view.scrollDOM;
        dom.addEventListener('mousedown', () => this.master = 'editor', { passive: true });
        dom.addEventListener('wheel', () => this.master = 'editor', { passive: true });
        dom.addEventListener('keydown', () => this.master = 'editor', { passive: true });
    }

    registerPreview(el: HTMLElement) {
        this.preview = el;
        el.addEventListener('mousedown', () => this.master = 'preview', { passive: true });
        el.addEventListener('wheel', () => this.master = 'preview', { passive: true });
    }

    async updateMap() {
        if (!this.preview) return;
        await tick();
        const container = this.preview;
        const containerRect = container.getBoundingClientRect();
        const elements = Array.from(container.querySelectorAll("[data-source-line]")) as HTMLElement[];

        this.lineMap = elements.map(el => ({
            line: parseInt(el.getAttribute("data-source-line") || "1", 10),
            y: el.getBoundingClientRect().top - containerRect.top + container.scrollTop
        })).sort((a, b) => a.line - b.line);

        if (this.lineMap.length > 0 && this.lineMap[0].line > 1) {
            this.lineMap.unshift({ line: 1, y: 0 });
        }
    }

    syncPreviewToEditor() {
        if (this.isLocked || this.master !== 'editor' || !this.editor || !this.preview || this.lineMap.length === 0) return;

        const scroller = this.editor.scrollDOM;
        const scrollTop = scroller.scrollTop;
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        if (maxScroll <= 0) return;

        const lineBlock = this.editor.lineBlockAtHeight(scrollTop);
        const lineNum = this.editor.state.doc.lineAt(lineBlock.from).number;
        const fraction = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
        const targetLine = lineNum + fraction;

        const previewMax = this.preview.scrollHeight - this.preview.clientHeight;
        let targetY = 0;

        if (scrollTop / maxScroll > 0.99) {
            targetY = previewMax;
        } else {
            let i = 1;
            for (; i < this.lineMap.length; i++) {
                if (this.lineMap[i].line > targetLine) break;
            }
            const before = this.lineMap[i - 1];
            const after = this.lineMap[i] || before;
            const ratio = (targetLine - before.line) / (after.line - before.line || 1);
            targetY = before.y + (after.y - before.y) * ratio;

            const padding = parseFloat(getComputedStyle(this.preview).paddingTop) || 0;
            targetY -= padding;
        }

        if (Math.abs(this.preview.scrollTop - targetY) > 1) {
            this.isLocked = true;
            this.preview.scrollTop = targetY;
            requestAnimationFrame(() => this.isLocked = false);
        }
    }

    syncEditorToPreview() {
        if (this.isLocked || this.master !== 'preview' || !this.editor || !this.preview || this.lineMap.length === 0) return;

        const scrollTop = this.preview.scrollTop;
        const maxScroll = this.preview.scrollHeight - this.preview.clientHeight;
        if (maxScroll <= 0) return;

        const padding = parseFloat(getComputedStyle(this.preview).paddingTop) || 0;
        const effectiveY = scrollTop + padding;

        let i = 1;
        for (; i < this.lineMap.length; i++) {
            if (this.lineMap[i].y > effectiveY) break;
        }
        const before = this.lineMap[i - 1];
        const after = this.lineMap[i] || before;
        const ratio = (effectiveY - before.y) / (after.y - before.y || 1);
        const targetLine = before.line + (after.line - before.line) * ratio;

        const scroller = this.editor.scrollDOM;
        let targetEditorY = 0;

        if (scrollTop / maxScroll > 0.99) {
            targetEditorY = scroller.scrollHeight - scroller.clientHeight;
        } else {
            const lineInt = Math.floor(targetLine);
            const lineFrac = targetLine - lineInt;
            const lineBlock = this.editor.lineBlockAt(this.editor.state.doc.line(Math.max(1, Math.min(lineInt, this.editor.state.doc.lines))).from);
            targetEditorY = lineBlock.top + (lineBlock.height * lineFrac);
        }

        if (Math.abs(scroller.scrollTop - targetEditorY) > 1) {
            this.isLocked = true;
            scroller.scrollTop = targetEditorY;
            requestAnimationFrame(() => this.isLocked = false);
        }
    }

    handleFastScroll(v: EditorView, target: number) {
        this.master = 'editor';
        const scroller = v.scrollDOM;
        const start = scroller.scrollTop;
        const dist = target - start;
        const duration = 200;
        const startTime = performance.now();

        const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            scroller.scrollTop = start + dist * ease;
            this.syncPreviewToEditor();
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
}

export const scrollSync = new ScrollSyncManager();
