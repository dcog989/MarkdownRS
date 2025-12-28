import { CONFIG } from "$lib/utils/config";
import { throttle } from "$lib/utils/timing";
import { EditorView } from "@codemirror/view";
import { tick } from "svelte";

class ScrollSyncManager {
    private editor: EditorView | null = null;
    private preview: HTMLElement | null = null;
    private lineMap: { line: number; y: number }[] = [];

    // State to prevent circular scroll loops
    // 'editor' = Editor is being scrolled by user, sync Preview
    // 'preview' = Preview is being scrolled by user, sync Editor
    // null = Idle
    private activeSource: 'editor' | 'preview' | null = null;
    private clearSourceTimer: number | null = null;
    private resizeObserver: ResizeObserver | null = null;

    registerEditor(view: EditorView) {
        if (this.editor === view) return;

        if (this.editor) {
            this.editor.scrollDOM.removeEventListener('scroll', this.onEditorScroll);
        }

        this.editor = view;
        // Bind to class instance
        this.onEditorScroll = this.onEditorScroll.bind(this);
        view.scrollDOM.addEventListener('scroll', this.onEditorScroll, { passive: true });
    }

    registerPreview(el: HTMLElement) {
        if (this.preview === el) return;

        if (this.preview) {
            this.preview.removeEventListener('scroll', this.onPreviewScroll);
            this.resizeObserver?.disconnect();
        }

        this.preview = el;
        this.onPreviewScroll = this.onPreviewScroll.bind(this);
        el.addEventListener('scroll', this.onPreviewScroll, { passive: true });

        // Observe content changes to rebuild map
        this.resizeObserver = new ResizeObserver(() => {
            // Debounce map updates slightly
            requestAnimationFrame(() => this.updateMap());
        });

        // Observe direct children (prose wrapper)
        Array.from(el.children).forEach(child => {
            this.resizeObserver?.observe(child);
        });
    }

    async updateMap() {
        if (!this.preview) return;

        await tick();

        const container = this.preview;
        const containerRect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;

        const elements = Array.from(container.querySelectorAll("[data-source-line]")) as HTMLElement[];

        // 1. Build Raw Map: Line -> Pixel Y (absolute in scrollable area)
        let rawMap = elements.map(el => {
            const rect = el.getBoundingClientRect();
            // Calculate Y relative to the top of the scrollable content
            // (Visual Top - Container Top) + Scrolled Amount
            const y = (rect.top - containerRect.top) + scrollTop;
            const line = parseInt(el.getAttribute("data-source-line") || "0", 10);
            return { line, y };
        })
            .filter(item => !isNaN(item.line));

        // 2. Sanitize Map
        // Ensure strictly increasing Lines and mostly increasing Ys
        // We filter out Ys that go backwards (rare, but possible with some CSS layouts)
        if (rawMap.length > 0) {
            rawMap.sort((a, b) => a.line - b.line);

            this.lineMap = [rawMap[0]];
            for (let i = 1; i < rawMap.length; i++) {
                const prev = this.lineMap[this.lineMap.length - 1];
                const curr = rawMap[i];

                // Only keep points that advance in both Line and Y
                // Or if Y is same but Line advances (horizontal elements)
                if (curr.line > prev.line && curr.y >= prev.y) {
                    this.lineMap.push(curr);
                }
            }
        } else {
            this.lineMap = [];
        }

        // 3. Anchor Boundaries
        // Force Line 1 -> 0px
        if (this.lineMap.length === 0 || this.lineMap[0].line > 1) {
            this.lineMap.unshift({ line: 1, y: 0 });
        } else {
            this.lineMap[0].y = 0; // Force line 1 to top
        }

        // If we have an editor, map the last line to the full height
        // This ensures the bottom of the editor maps to the bottom of the preview
        if (this.editor) {
            const totalLines = this.editor.state.doc.lines;
            const scrollHeight = container.scrollHeight;

            // Only add bottom anchor if the last mapped point isn't already at the bottom/end
            const last = this.lineMap[this.lineMap.length - 1];
            if (last.line < totalLines) {
                this.lineMap.push({ line: totalLines, y: scrollHeight });
            }
        }
    }

    private syncPreviewThrottled = throttle(
        () => requestAnimationFrame(() => this.syncPreview()),
        CONFIG.PERFORMANCE.SCROLL_SYNC_THROTTLE_MS
    );

    private syncEditorThrottled = throttle(
        () => requestAnimationFrame(() => this.syncEditor()),
        CONFIG.PERFORMANCE.SCROLL_SYNC_THROTTLE_MS
    );

    private onEditorScroll() {
        // If the preview is currently driving the scroll (user dragging preview scrollbar),
        // ignore the echo event from the editor.
        if (this.activeSource === 'preview') return;

        this.setActiveSource('editor');
        this.syncPreviewThrottled();
    }

    private onPreviewScroll() {
        // If the editor is currently driving, ignore echo.
        if (this.activeSource === 'editor') return;

        this.setActiveSource('preview');
        this.syncEditorThrottled();
    }

    private setActiveSource(source: 'editor' | 'preview') {
        this.activeSource = source;
        if (this.clearSourceTimer) clearTimeout(this.clearSourceTimer);
        // Release lock after scroll events stop firing (debounce)
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

        // 1. Handle Boundaries explicitly
        if (scrollTop <= 0) {
            this.preview.scrollTop = 0;
            return;
        }
        if (scrollTop >= maxScroll - 1) {
            this.preview.scrollTop = this.preview.scrollHeight - this.preview.clientHeight;
            return;
        }

        // 2. Fallback for sparse maps (e.g. giant code block)
        // If map has too few points, use simple percentage
        if (this.lineMap.length < 2) {
            const pct = scrollTop / maxScroll;
            this.preview.scrollTop = pct * (this.preview.scrollHeight - this.preview.clientHeight);
            return;
        }

        // 3. Calculate current visual line in Editor
        const lineBlock = this.editor.lineBlockAtHeight(scrollTop);
        const docLine = this.editor.state.doc.lineAt(lineBlock.from);

        // Add fractional progress through the line for smoothness
        // (scrollTop - lineBlock.top) is pixels scrolled PAST the start of the line
        const fraction = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
        const currentLine = docLine.number + fraction;

        // 4. Map Line -> Preview Y
        const targetY = this.interpolate(currentLine, 'line', 'y');

        // 5. Scroll Preview
        // Use a threshold to prevent micro-adjustments
        if (Math.abs(this.preview.scrollTop - targetY) > 2) {
            this.preview.scrollTop = targetY;
        }
    }

    private syncEditor() {
        if (!this.editor || !this.preview) return;

        const scrollTop = this.preview.scrollTop;
        const scrollHeight = this.preview.scrollHeight;
        const clientHeight = this.preview.clientHeight;
        const maxScroll = scrollHeight - clientHeight;

        // 1. Boundaries
        if (scrollTop <= 0) {
            this.editor.scrollDOM.scrollTop = 0;
            return;
        }
        if (scrollTop >= maxScroll - 1) {
            this.editor.scrollDOM.scrollTop = this.editor.scrollDOM.scrollHeight - this.editor.scrollDOM.clientHeight;
            return;
        }

        // 2. Fallback for sparse maps
        if (this.lineMap.length < 2) {
            const pct = scrollTop / maxScroll;
            const editorMax = this.editor.scrollDOM.scrollHeight - this.editor.scrollDOM.clientHeight;
            this.editor.scrollDOM.scrollTop = pct * editorMax;
            return;
        }

        // 3. Map Preview Y -> Editor Line
        const targetLine = this.interpolate(scrollTop, 'y', 'line');

        // 4. Convert Line -> Editor Y
        const docLines = this.editor.state.doc.lines;
        const safeLine = Math.max(1, Math.min(targetLine, docLines));

        const lineInt = Math.floor(safeLine);
        const lineFrac = safeLine - lineInt;

        // Get pixel position of that line
        const lineInfo = this.editor.lineBlockAt(this.editor.state.doc.line(lineInt).from);
        const targetY = lineInfo.top + (lineInfo.height * lineFrac);

        // 5. Scroll Editor
        if (Math.abs(this.editor.scrollDOM.scrollTop - targetY) > 2) {
            this.editor.scrollDOM.scrollTop = targetY;
        }
    }

    /**
     * Interpolates value from Input Domain to Output Range using the lineMap.
     */
    private interpolate(val: number, inputKey: 'line' | 'y', outputKey: 'line' | 'y'): number {
        const map = this.lineMap;

        // Find the segment [p1, p2] where p1[input] <= val <= p2[input]
        // Binary search for efficiency
        let lo = 0, hi = map.length - 1;

        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (map[mid][inputKey] < val) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        // lo is the index of the first element > val.
        // so lo-1 is the index of the first element <= val (our p1).
        const idx = Math.max(0, Math.min(lo - 1, map.length - 2));

        const p1 = map[idx];
        const p2 = map[idx + 1];

        // Fallbacks if map is degenerate
        if (!p2) return p1 ? p1[outputKey] : 0;

        const inputSpan = p2[inputKey] - p1[inputKey];
        const outputSpan = p2[outputKey] - p1[outputKey];

        if (inputSpan === 0) return p1[outputKey];

        const ratio = (val - p1[inputKey]) / inputSpan;
        return p1[outputKey] + (ratio * outputSpan);
    }

    handleFastScroll(v: EditorView, targetY: number) {
        // Force lock to editor
        this.setActiveSource('editor');

        // Extend lock time to cover animation
        if (this.clearSourceTimer) clearTimeout(this.clearSourceTimer);
        this.clearSourceTimer = window.setTimeout(() => {
            this.activeSource = null;
        }, 300);

        v.scrollDOM.scrollTop = targetY;
        this.syncPreview();
    }
}

export const scrollSync = new ScrollSyncManager();
