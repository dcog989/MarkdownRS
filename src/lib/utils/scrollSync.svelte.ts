import { EditorView } from "@codemirror/view";
import { tick } from "svelte";

class ScrollSyncManager {
    private editor: EditorView | null = null;
    private preview: HTMLElement | null = null;
    private lineMap: { line: number; y: number }[] = [];
    private isLocked = false;
    private master: 'editor' | 'preview' | null = null;

    handleEvent(event: Event) {
        if (this.editor && event.currentTarget === this.editor.scrollDOM) {
            this.master = 'editor';
        } else if (this.preview && event.currentTarget === this.preview) {
            this.master = 'preview';
        }
    }

    registerEditor(view: EditorView) {
        if (this.editor === view) return;

        if (this.editor) {
            const dom = this.editor.scrollDOM;
            dom.removeEventListener('mousedown', this);
            dom.removeEventListener('wheel', this);
            dom.removeEventListener('keydown', this);
        }

        this.editor = view;
        const dom = view.scrollDOM;
        dom.addEventListener('mousedown', this, { passive: true });
        dom.addEventListener('wheel', this, { passive: true });
        dom.addEventListener('keydown', this, { passive: true });
    }

    registerPreview(el: HTMLElement) {
        if (this.preview === el) return;

        if (this.preview) {
            this.preview.removeEventListener('mousedown', this);
            this.preview.removeEventListener('wheel', this);
        }

        this.preview = el;
        el.addEventListener('mousedown', this, { passive: true });
        el.addEventListener('wheel', this, { passive: true });
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
        if (this.isLocked || this.master !== 'editor' || !this.editor || !this.preview) return;
        if (!this.lineMap || this.lineMap.length === 0) return;

        const scroller = this.editor.scrollDOM;
        const scrollTop = scroller.scrollTop;
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        if (maxScroll <= 0) return;

        const scrollRatio = scrollTop / maxScroll;
        const previewMax = this.preview.scrollHeight - this.preview.clientHeight;

        let targetY = 0;

        // Force top alignment
        if (scrollTop === 0) {
            targetY = 0;
        }
        // If editor is at the very bottom, keep preview at the very bottom
        else if (scrollRatio >= 0.99) {
            targetY = previewMax;
        } else {
            const lineBlock = this.editor.lineBlockAtHeight(scrollTop);
            const lineNum = this.editor.state.doc.lineAt(lineBlock.from).number;
            const fraction = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
            const targetLine = lineNum + fraction;

            // Find the segment containing targetLine
            let i = 0;
            for (; i < this.lineMap.length; i++) {
                if (this.lineMap[i].line > targetLine) break;
            }

            // Safe index access
            const prevIdx = Math.max(0, i - 1);
            const nextIdx = Math.min(i, this.lineMap.length - 1);

            const before = this.lineMap[prevIdx];
            const after = this.lineMap[nextIdx];

            if (before && after) {
                const ratio = (targetLine - before.line) / (after.line - before.line || 1);
                targetY = before.y + (after.y - before.y) * ratio;

                const padding = parseFloat(getComputedStyle(this.preview).paddingTop) || 0;
                targetY -= padding;
            }

            // Always clamp to valid scroll range to prevent jumps
            targetY = Math.max(0, Math.min(targetY, previewMax));
        }

        if (Math.abs(this.preview.scrollTop - targetY) > 1) {
            this.isLocked = true;
            this.preview.scrollTop = targetY;
            requestAnimationFrame(() => this.isLocked = false);
        }
    }

    syncEditorToPreview() {
        if (this.isLocked || this.master !== 'preview' || !this.editor || !this.preview) return;
        if (!this.lineMap || this.lineMap.length === 0) return;

        const scrollTop = this.preview.scrollTop;
        const maxScroll = this.preview.scrollHeight - this.preview.clientHeight;
        if (maxScroll <= 0) return;

        // Force top alignment
        if (scrollTop === 0) {
            if (this.editor.scrollDOM.scrollTop !== 0) {
                this.isLocked = true;
                this.editor.scrollDOM.scrollTop = 0;
                requestAnimationFrame(() => this.isLocked = false);
            }
            return;
        }

        const padding = parseFloat(getComputedStyle(this.preview).paddingTop) || 0;
        const effectiveY = scrollTop + padding;

        let i = 0;
        for (; i < this.lineMap.length; i++) {
            if (this.lineMap[i].y > effectiveY) break;
        }

        // Safe index access
        const prevIdx = Math.max(0, i - 1);
        const nextIdx = Math.min(i, this.lineMap.length - 1);

        const before = this.lineMap[prevIdx];
        const after = this.lineMap[nextIdx];

        // Default to not moving if something is wrong, though indices are clamped
        let targetLine = 1;

        if (before && after) {
            const ratio = (effectiveY - before.y) / (after.y - before.y || 1);
            targetLine = before.line + (after.line - before.line) * ratio;
        }

        const scroller = this.editor.scrollDOM;
        let targetEditorY = 0;

        if (scrollTop / maxScroll > 0.99) {
            targetEditorY = scroller.scrollHeight - scroller.clientHeight;
        } else {
            const lineInt = Math.floor(targetLine);
            const lineFrac = targetLine - lineInt;
            // Ensure line access is within document bounds
            const docLines = this.editor.state.doc.lines;
            const safeLine = Math.max(1, Math.min(lineInt, docLines));

            const lineBlock = this.editor.lineBlockAt(this.editor.state.doc.line(safeLine).from);
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
