import { EditorView } from "@codemirror/view";
import { tick } from "svelte";

class ScrollSyncManager {
    private editor: EditorView | null = null;
    private preview: HTMLElement | null = null;

    // Cache for line mapping: [{ line: 1, y: 0 }, { line: 10, y: 500 }, ...]
    private lineMap: { line: number; y: number }[] = [];

    // State for locking mechanism to prevent circular scrolling
    private isSyncing = false;
    private pendingSource: 'editor' | 'preview' | null = null;
    private lockTimeout: number | null = null;

    registerEditor(view: EditorView) {
        this.editor = view;
    }

    registerPreview(el: HTMLElement) {
        this.preview = el;
    }

    /**
     * Rebuilds the mapping between markdown source lines and preview pixel offsets.
     * Call this when preview content changes.
     */
    async updateMap() {
        if (!this.preview) return;

        // Wait for DOM update to ensure accurate measurements
        await tick();

        const container = this.preview;
        const containerRect = container.getBoundingClientRect();

        // Get all elements with a source line mapping
        const elements = Array.from(container.querySelectorAll("[data-source-line]")) as HTMLElement[];

        this.lineMap = elements.map(el => {
            const rect = el.getBoundingClientRect();
            // Calculate Y position relative to the top of the SCROLLABLE content
            // scrollTop adds the scrolled amount, rect.top - containerRect.top gives relative screen pos
            const y = rect.top - containerRect.top + container.scrollTop;
            const line = parseInt(el.getAttribute("data-source-line") || "0", 10);
            return { line, y };
        })
            .filter(item => !isNaN(item.line))
            .sort((a, b) => a.line - b.line);

        // Ensure we have a start point
        if (this.lineMap.length === 0) {
            this.lineMap = [{ line: 0, y: 0 }];
        }

        // Force the first mapped element to start at 0 if it's the first line or close to it
        // This ensures the top of the document syncs to the top of the preview
        if (this.lineMap[0].line <= 1) {
            this.lineMap[0].y = 0;
        } else {
            this.lineMap.unshift({ line: 1, y: 0 });
        }
    }

    /**
     * Triggered when Editor scrolls. Syncs Preview to match.
     */
    syncPreviewToEditor() {
        // If we are currently syncing driven by the preview, ignore this event
        if (this.isSyncing && this.pendingSource === 'preview') return;

        this.pendingSource = 'editor';
        this.setLock();

        // Use RAF to decouple calculation from the scroll event
        requestAnimationFrame(() => this.performSyncToPreview());
    }

    /**
     * Triggered when Preview scrolls. Syncs Editor to match.
     */
    syncEditorToPreview() {
        // If we are currently syncing driven by the editor, ignore this event
        if (this.isSyncing && this.pendingSource === 'editor') return;

        this.pendingSource = 'preview';
        this.setLock();

        requestAnimationFrame(() => this.performSyncToEditor());
    }

    private setLock() {
        this.isSyncing = true;
        if (this.lockTimeout) clearTimeout(this.lockTimeout);
        // Short timeout to release lock after scroll events settle
        this.lockTimeout = window.setTimeout(() => {
            this.isSyncing = false;
            this.pendingSource = null;
        }, 50);
    }

    /**
     * Logic: Map Editor Position -> Preview Position
     */
    private performSyncToPreview() {
        if (!this.editor || !this.preview) return;

        const editorScroll = this.editor.scrollDOM;
        const previewScroll = this.preview;

        const editorTop = editorScroll.scrollTop;
        const editorHeight = editorScroll.scrollHeight - editorScroll.clientHeight;
        const previewHeight = previewScroll.scrollHeight - previewScroll.clientHeight;

        // 1. Explicit Boundary Handling (Top)
        // If editor is at absolute top, force preview to absolute top
        if (editorTop <= 0) {
            if (previewScroll.scrollTop !== 0) {
                previewScroll.scrollTop = 0;
            }
            return;
        }

        // 2. Explicit Boundary Handling (Bottom)
        // If editor is at bottom, force preview to bottom
        if (editorTop >= editorHeight - 1) {
            if (previewScroll.scrollTop !== previewHeight) {
                previewScroll.scrollTop = previewHeight;
            }
            return;
        }

        // 3. Calculate Editor Line
        // CodeMirror returns the line block at the visual top
        const lineBlock = this.editor.lineBlockAtHeight(editorTop);
        const lineNum = this.editor.state.doc.lineAt(lineBlock.from).number;
        // Calculate fractional progress through that line (for smooth scrolling)
        const lineProgress = (editorTop - lineBlock.top) / Math.max(1, lineBlock.height);
        const targetLine = lineNum + lineProgress;

        // 4. Map to Preview Y
        const targetY = this.interpolate(targetLine, 'line', 'y');

        // 5. Scroll Preview
        // Only scroll if difference is significant to avoid jitter
        if (Math.abs(previewScroll.scrollTop - targetY) > 1) {
            previewScroll.scrollTop = targetY;
        }
    }

    /**
     * Logic: Map Preview Position -> Editor Position
     */
    private performSyncToEditor() {
        if (!this.editor || !this.preview) return;

        const previewScroll = this.preview;
        const editorScroll = this.editor.scrollDOM;

        const previewTop = previewScroll.scrollTop;
        const previewHeight = previewScroll.scrollHeight - previewScroll.clientHeight;
        const editorHeight = editorScroll.scrollHeight - editorScroll.clientHeight;

        // 1. Explicit Boundary Handling (Top)
        if (previewTop <= 0) {
            if (editorScroll.scrollTop !== 0) {
                editorScroll.scrollTop = 0;
            }
            return;
        }

        // 2. Explicit Boundary Handling (Bottom)
        if (previewTop >= previewHeight - 1) {
            if (editorScroll.scrollTop !== editorHeight) {
                editorScroll.scrollTop = editorHeight;
            }
            return;
        }

        // 3. Map to Editor Line
        const targetLine = this.interpolate(previewTop, 'y', 'line');

        // 4. Convert Line -> Editor Pixels
        const docLines = this.editor.state.doc.lines;
        const safeLine = Math.max(1, Math.min(targetLine, docLines));

        const lineInfo = this.editor.lineBlockAt(this.editor.state.doc.line(Math.floor(safeLine)).from);
        const lineFraction = safeLine % 1;
        const targetY = lineInfo.top + (lineInfo.height * lineFraction);

        // 5. Scroll Editor
        if (Math.abs(editorScroll.scrollTop - targetY) > 1) {
            editorScroll.scrollTop = targetY;
        }
    }

    /**
     * Linear interpolation between mapping points.
     * Finds the two points bounding 'value' and interpolates the output.
     */
    private interpolate(value: number, inputKey: 'line' | 'y', outputKey: 'line' | 'y'): number {
        const map = this.lineMap;
        if (map.length === 0) return 0;

        // Find the index where map[i] >= value
        let idx = -1;
        for (let i = 0; i < map.length; i++) {
            if (map[i][inputKey] >= value) {
                idx = i;
                break;
            }
        }

        // Exact match or value is smaller than first point
        if (idx === 0) return map[0][outputKey];

        // Value is larger than last point
        if (idx === -1) {
            return map[map.length - 1][outputKey];
        }

        // Interpolate between idx-1 and idx
        const p1 = map[idx - 1];
        const p2 = map[idx];

        const rangeInput = p2[inputKey] - p1[inputKey];
        const rangeOutput = p2[outputKey] - p1[outputKey];

        if (rangeInput === 0) return p1[outputKey];

        const progress = (value - p1[inputKey]) / rangeInput;
        return p1[outputKey] + (progress * rangeOutput);
    }

    /**
     * Programmatic smooth scroll handler (e.g. for keyboard navigation).
     * Forces the source to 'editor' so the preview follows.
     */
    handleFastScroll(v: EditorView, targetY: number) {
        this.editor = v; // Ensure ref is current
        this.pendingSource = 'editor';
        this.setLock();

        const start = v.scrollDOM.scrollTop;
        const dist = targetY - start;
        const duration = 200;
        const startTime = performance.now();

        const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease out

            v.scrollDOM.scrollTop = start + (dist * ease);

            // Explicitly trigger sync calculation
            this.performSyncToPreview();

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                this.pendingSource = null;
                this.isSyncing = false;
            }
        };
        requestAnimationFrame(step);
    }
}

export const scrollSync = new ScrollSyncManager();
