import { CONFIG } from "$lib/utils/config";
import { throttle } from "$lib/utils/timing";
import { EditorView } from "@codemirror/view";

export class ScrollSyncManager {
    editor = $state<EditorView | null>(null);
    preview = $state<HTMLElement | null>(null);
    private lineMap: { line: number; y: number }[] = [];

    // State to prevent circular scroll loops
    private activeSource = $state<"editor" | "preview" | null>(null);
    private clearSourceTimer: number | null = null;
    private resizeObserver: ResizeObserver | null = null;

    constructor() {
        // Automatically update map when preview changes size or content
        $effect.root(() => {
            $effect(() => {
                if (this.preview) {
                    this.resizeObserver?.disconnect();
                    this.resizeObserver = new ResizeObserver(() => {
                        requestAnimationFrame(() => this.updateMap());
                    });

                    // Observe container and children
                    this.resizeObserver.observe(this.preview);
                    Array.from(this.preview.children).forEach((child) => {
                        this.resizeObserver?.observe(child);
                    });

                    return () => {
                        this.resizeObserver?.disconnect();
                    };
                }
            });
        });
    }

    registerEditor(view: EditorView) {
        if (this.editor === view) return;

        if (this.editor) {
            this.editor.scrollDOM.removeEventListener("scroll", this.onEditorScroll);
        }

        this.editor = view;
        // Bind to class instance
        this.onEditorScroll = this.onEditorScroll.bind(this);
        view.scrollDOM.addEventListener("scroll", this.onEditorScroll, { passive: true });
    }

    registerPreview(el: HTMLElement) {
        if (this.preview === el) return;

        if (this.preview) {
            this.preview.removeEventListener("scroll", this.onPreviewScroll);
        }

        this.preview = el;
        this.onPreviewScroll = this.onPreviewScroll.bind(this);
        el.addEventListener("scroll", this.onPreviewScroll, { passive: true });
    }

    updateMap() {
        if (!this.preview) return;

        const container = this.preview;
        const containerRect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;

        // Query only elements with data-source-line attribute
        // We use a more specific query to avoid layout thrashing if possible, but map build is heavy anyway
        const elements = Array.from(
            container.querySelectorAll("[data-source-line]")
        ) as HTMLElement[];

        // 1. Build Raw Map: Line -> Pixel Y (absolute in scrollable area)
        let rawMap = elements
            .map((el) => {
                const rect = el.getBoundingClientRect();
                // Calculate Y relative to the top of the scrollable content
                const y = rect.top - containerRect.top + scrollTop;
                const line = parseInt(el.getAttribute("data-source-line") || "0", 10);
                return { line, y };
            })
            .filter((item) => !isNaN(item.line));

        // 2. Sanitize Map
        if (rawMap.length > 0) {
            rawMap.sort((a, b) => a.line - b.line);

            this.lineMap = [rawMap[0]];
            for (let i = 1; i < rawMap.length; i++) {
                const prev = this.lineMap[this.lineMap.length - 1];
                const curr = rawMap[i];

                if (curr.line > prev.line && curr.y >= prev.y) {
                    this.lineMap.push(curr);
                }
            }
        } else {
            this.lineMap = [];
        }

        // 3. Anchor Boundaries
        if (this.lineMap.length === 0 || this.lineMap[0].line > 1) {
            this.lineMap.unshift({ line: 1, y: 0 });
        } else {
            this.lineMap[0].y = 0;
        }

        if (this.editor) {
            const totalLines = this.editor.state.doc.lines;
            const scrollHeight = container.scrollHeight;
            const last = this.lineMap[this.lineMap.length - 1];
            if (last.line < totalLines) {
                this.lineMap.push({ line: totalLines, y: scrollHeight });
            }
        }
    }

    private syncPreviewThrottled = throttle(() => {
        // Use requestAnimationFrame to batch DOM writes
        if (!this.syncPreviewRAF) {
            this.syncPreviewRAF = requestAnimationFrame(() => {
                this.syncPreviewRAF = null;
                this.syncPreview();
            });
        }
    }, CONFIG.PERFORMANCE.SCROLL_SYNC_THROTTLE_MS);

    private syncEditorThrottled = throttle(() => {
        // Use requestAnimationFrame to batch DOM writes
        if (!this.syncEditorRAF) {
            this.syncEditorRAF = requestAnimationFrame(() => {
                this.syncEditorRAF = null;
                this.syncEditor();
            });
        }
    }, CONFIG.PERFORMANCE.SCROLL_SYNC_THROTTLE_MS);

    private syncPreviewRAF: number | null = null;
    private syncEditorRAF: number | null = null;

    private onEditorScroll() {
        if (this.activeSource === "preview") return;
        this.setActiveSource("editor");
        this.syncPreviewThrottled();
    }

    private onPreviewScroll() {
        if (this.activeSource === "editor") return;
        this.setActiveSource("preview");
        this.syncEditorThrottled();
    }

    private setActiveSource(source: "editor" | "preview") {
        this.activeSource = source;
        if (this.clearSourceTimer) clearTimeout(this.clearSourceTimer);
        this.clearSourceTimer = window.setTimeout(() => {
            this.activeSource = null;
        }, 150);
    }

    private syncPreview() {
        if (!this.editor || !this.preview) return;

        const editorScroll = this.editor.scrollDOM;
        const scrollTop = editorScroll.scrollTop;
        const scrollHeight = editorScroll.scrollHeight;
        const clientHeight = editorScroll.clientHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (scrollTop <= 0) {
            if (this.preview.scrollTop > 0) {
                this.preview.scrollTop = 0;
            }
            return;
        }
        if (scrollTop >= maxScroll - 1) {
            const targetBottom = this.preview.scrollHeight - this.preview.clientHeight;
            if (Math.abs(this.preview.scrollTop - targetBottom) > 2) {
                this.preview.scrollTop = targetBottom;
            }
            return;
        }

        if (this.lineMap.length < 2) {
            const pct = scrollTop / maxScroll;
            const targetTop = pct * (this.preview.scrollHeight - this.preview.clientHeight);
            if (
                Math.abs(this.preview.scrollTop - targetTop) >
                CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX
            ) {
                this.preview.scrollTop = targetTop;
            }
            return;
        }

        const lineBlock = this.editor.lineBlockAtHeight(scrollTop);
        const docLine = this.editor.state.doc.lineAt(lineBlock.from);
        const fraction = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
        const currentLine = docLine.number + fraction;

        const targetY = this.interpolate(currentLine, "line", "y");

        if (
            Math.abs(this.preview.scrollTop - targetY) > CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX
        ) {
            this.preview.scrollTop = targetY;
        }
    }

    private syncEditor() {
        if (!this.editor || !this.preview) return;

        const scrollTop = this.preview.scrollTop;
        const scrollHeight = this.preview.scrollHeight;
        const clientHeight = this.preview.clientHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (scrollTop <= 0) {
            if (this.editor.scrollDOM.scrollTop > 0) {
                this.editor.scrollDOM.scrollTop = 0;
            }
            return;
        }
        if (scrollTop >= maxScroll - 1) {
            const targetBottom =
                this.editor.scrollDOM.scrollHeight - this.editor.scrollDOM.clientHeight;
            if (Math.abs(this.editor.scrollDOM.scrollTop - targetBottom) > 2) {
                this.editor.scrollDOM.scrollTop = targetBottom;
            }
            return;
        }

        if (this.lineMap.length < 2) {
            const pct = scrollTop / maxScroll;
            const editorMax =
                this.editor.scrollDOM.scrollHeight - this.editor.scrollDOM.clientHeight;
            const targetTop = pct * editorMax;
            if (
                Math.abs(this.editor.scrollDOM.scrollTop - targetTop) >
                CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX
            ) {
                this.editor.scrollDOM.scrollTop = targetTop;
            }
            return;
        }

        const targetLine = this.interpolate(scrollTop, "y", "line");
        const docLines = this.editor.state.doc.lines;
        const safeLine = Math.max(1, Math.min(targetLine, docLines));

        const lineInt = Math.floor(safeLine);
        const lineFrac = safeLine - lineInt;

        const lineInfo = this.editor.lineBlockAt(this.editor.state.doc.line(lineInt).from);
        const targetY = lineInfo.top + lineInfo.height * lineFrac;

        if (
            Math.abs(this.editor.scrollDOM.scrollTop - targetY) >
            CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX
        ) {
            this.editor.scrollDOM.scrollTop = targetY;
        }
    }

    private interpolate(val: number, inputKey: "line" | "y", outputKey: "line" | "y"): number {
        const map = this.lineMap;
        let lo = 0,
            hi = map.length - 1;

        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (map[mid][inputKey] < val) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        const idx = Math.max(0, Math.min(lo - 1, map.length - 2));
        const p1 = map[idx];
        const p2 = map[idx + 1];

        if (!p2) return p1 ? p1[outputKey] : 0;

        const inputSpan = p2[inputKey] - p1[inputKey];
        const outputSpan = p2[outputKey] - p1[outputKey];

        if (inputSpan === 0) return p1[outputKey];

        const ratio = (val - p1[inputKey]) / inputSpan;
        return p1[outputKey] + ratio * outputSpan;
    }

    handleFastScroll(v: EditorView, targetY: number) {
        this.setActiveSource("editor");
        if (this.clearSourceTimer) clearTimeout(this.clearSourceTimer);
        this.clearSourceTimer = window.setTimeout(() => {
            this.activeSource = null;
        }, 300);

        v.scrollDOM.scrollTop = targetY;
        this.syncPreview();
    }
}

export const scrollSync = new ScrollSyncManager();
