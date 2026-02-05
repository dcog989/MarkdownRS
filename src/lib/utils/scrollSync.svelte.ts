import { CONFIG } from '$lib/utils/config';
import { throttle } from '$lib/utils/timing';
import { type EditorView } from '@codemirror/view';
import { SvelteSet } from 'svelte/reactivity';

export class ScrollSyncManager {
    editor = $state<EditorView | null>(null);
    preview = $state<HTMLElement | null>(null);
    private lineMap: { line: number; y: number }[] = [];

    // State to prevent circular scroll loops
    private activeSource = $state<'editor' | 'preview' | null>(null);
    private clearSourceTimer: number | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private updateMapTimer: number | null = null;
    private mapDirty = $state(false);

    // Cache for element visibility state to avoid calculating rects for off-screen elements
    private visibleElements = new SvelteSet<HTMLElement>();
    private elementVisibilityObserver: IntersectionObserver | null = null;

    constructor() {
        // Automatically update map when preview changes size or content
        $effect.root(() => {
            $effect(() => {
                if (this.preview) {
                    this.resizeObserver?.disconnect();
                    this.resizeObserver = new ResizeObserver(() => {
                        // Debounce and batch resize updates to prevent excessive map rebuilding
                        // Only rebuild if content actually changed (dirty flag), not just resized
                        if (this.mapDirty) {
                            if (this.updateMapTimer) clearTimeout(this.updateMapTimer);
                            this.updateMapTimer = window.setTimeout(() => {
                                this.updateMapTimer = null;
                                this.mapDirty = false;
                                requestAnimationFrame(() => this.updateMap());
                            }, CONFIG.PERFORMANCE.SCROLL_SYNC_RESIZE_DEBOUNCE_MS);
                        }
                    });

                    // Observe container only - children will trigger container resize if needed
                    // This reduces observer overhead significantly
                    this.resizeObserver.observe(this.preview);

                    return () => {
                        this.resizeObserver?.disconnect();
                        this.elementVisibilityObserver?.disconnect();
                        this.visibleElements.clear();
                        if (this.updateMapTimer) {
                            clearTimeout(this.updateMapTimer);
                            this.updateMapTimer = null;
                        }
                    };
                }
            });
        });
    }

    markMapDirty() {
        this.mapDirty = true;
    }

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
            this.elementVisibilityObserver?.disconnect();
            this.visibleElements.clear();
        }

        this.preview = el;
        this.onPreviewScroll = this.onPreviewScroll.bind(this);
        el.addEventListener('scroll', this.onPreviewScroll, { passive: true });

        // Set up IntersectionObserver to track visible elements
        // This avoids expensive getBoundingClientRect calls for off-screen elements
        this.elementVisibilityObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const el = entry.target as HTMLElement;
                    if (entry.isIntersecting) {
                        this.visibleElements.add(el);
                    } else {
                        this.visibleElements.delete(el);
                    }
                }
            },
            {
                root: el,
                rootMargin: '1000px', // Include elements 1000px above/below viewport
                threshold: 0,
            },
        );
    }

    updateMap() {
        if (!this.preview || !this.editor) return; // Add editor check to prevent initialization issues

        const container = this.preview;
        const containerRect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;

        // Query only elements with data-source-line attribute
        const elements = Array.from(
            container.querySelectorAll('[data-source-line]'),
        ) as HTMLElement[];

        // Reset visibility tracking for new content
        this.visibleElements.clear();
        this.elementVisibilityObserver?.disconnect();

        // Observe all elements for visibility changes
        for (const el of elements) {
            this.elementVisibilityObserver?.observe(el);
        }

        // Batch all getBoundingClientRect() calls to prevent layout thrashing
        // Only calculate rects for visible elements - use offsetTop for hidden elements (cheaper)
        const rawMap: { line: number; y: number }[] = [];
        for (const el of elements) {
            const lineAttr = el.getAttribute('data-source-line');
            if (!lineAttr) continue;
            const line = parseInt(lineAttr, 10);
            if (isNaN(line)) continue;

            // Use getBoundingClientRect for visible elements (more accurate)
            // Use offsetTop for hidden elements (cheaper, no forced layout)
            let y: number;
            if (this.visibleElements.has(el)) {
                const rect = el.getBoundingClientRect();
                y = rect.top - containerRect.top + scrollTop;
            } else {
                y = el.offsetTop;
            }
            rawMap.push({ line, y });
        }

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
        if (this.activeSource === 'preview') return;
        this.setActiveSource('editor');
        this.syncPreviewThrottled();
    }

    private onPreviewScroll() {
        if (this.activeSource === 'editor') return;
        this.setActiveSource('preview');
        this.syncEditorThrottled();
    }

    private setActiveSource(source: 'editor' | 'preview') {
        this.activeSource = source;
        if (this.clearSourceTimer) clearTimeout(this.clearSourceTimer);
        this.clearSourceTimer = window.setTimeout(() => {
            this.activeSource = null;
        }, 150);
    }

    private syncScrollPosition(
        source: HTMLElement,
        target: HTMLElement,
        direction: 'editor-to-preview' | 'preview-to-editor',
    ) {
        const scrollTop = source.scrollTop;
        const scrollHeight = source.scrollHeight;
        const clientHeight = source.clientHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (scrollTop <= 0) {
            if (target.scrollTop > 0) {
                target.scrollTop = 0;
            }
            return;
        }
        if (scrollTop >= maxScroll - 1) {
            const targetBottom = target.scrollHeight - target.clientHeight;
            if (Math.abs(target.scrollTop - targetBottom) > 2) {
                target.scrollTop = targetBottom;
            }
            return;
        }

        if (this.lineMap.length < 2) {
            const pct = scrollTop / maxScroll;
            const targetMax = target.scrollHeight - target.clientHeight;
            const targetTop = pct * targetMax;
            if (
                Math.abs(target.scrollTop - targetTop) > CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX
            ) {
                target.scrollTop = targetTop;
            }
            return;
        }

        let targetY: number;
        if (direction === 'editor-to-preview') {
            const lineBlock = this.editor!.lineBlockAtHeight(scrollTop);
            const docLine = this.editor!.state.doc.lineAt(lineBlock.from);
            const fraction = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
            const currentLine = docLine.number + fraction;
            targetY = this.interpolate(currentLine, 'line', 'y');
        } else {
            const targetLine = this.interpolate(scrollTop, 'y', 'line');
            const docLines = this.editor!.state.doc.lines;
            const safeLine = Math.max(1, Math.min(targetLine, docLines));
            const lineInt = Math.floor(safeLine);
            const lineFrac = safeLine - lineInt;
            const lineInfo = this.editor!.lineBlockAt(this.editor!.state.doc.line(lineInt).from);
            targetY = lineInfo.top + lineInfo.height * lineFrac;
        }

        if (Math.abs(target.scrollTop - targetY) > CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX) {
            target.scrollTop = targetY;
        }
    }

    private syncPreview() {
        if (!this.editor || !this.preview) return;
        this.syncScrollPosition(this.editor.scrollDOM, this.preview, 'editor-to-preview');
    }

    private syncEditor() {
        if (!this.editor || !this.preview) return;
        this.syncScrollPosition(this.preview, this.editor.scrollDOM, 'preview-to-editor');
    }

    private interpolate(val: number, inputKey: 'line' | 'y', outputKey: 'line' | 'y'): number {
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
        this.setActiveSource('editor');
        if (this.clearSourceTimer) clearTimeout(this.clearSourceTimer);
        this.clearSourceTimer = window.setTimeout(() => {
            this.activeSource = null;
        }, 300);

        v.scrollDOM.scrollTop = targetY;
        this.syncPreview();
    }
}

export const scrollSync = new ScrollSyncManager();
