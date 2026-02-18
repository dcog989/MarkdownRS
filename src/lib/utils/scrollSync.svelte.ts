/**
 * Scroll Sync State Management
 *
 * This file uses a hybrid approach of reactive and non-reactive state:
 *
 * REACTIVE STATE ($state):
 * - editor, preview: DOM elements that trigger effects when changed
 * - activeSource: Prevents circular scroll loops (UI reacts to changes)
 * - mapDirty: Triggers map rebuild when content changes
 *
 * NON-REACTIVE STATE (plain properties):
 * - lineMap: Array of line->pixel mappings (rebuilt on content change, not reactive)
 * - worker: Web Worker instance (no reactivity needed)
 * - pendingSyncs: SvelteMap tracking pending sync operations (async coordination)
 * - visibleElements: SvelteSet of visible preview elements (DOM optimization)
 * - Various timers and observers (imperative cleanup required)
 *
 * Pattern Rationale:
 * - Use $state for values that UI/effects need to react to
 * - Use plain properties for data that's computed/rebuilt imperatively
 * - Use SvelteMap/SvelteSet for collections that need reactivity but not Proxy overhead
 */

import { CONFIG } from '$lib/utils/config';
import { throttle } from '$lib/utils/timing';
import { type EditorView } from '@codemirror/view';
import { SvelteMap } from 'svelte/reactivity';
import ScrollSyncWorker from '$lib/workers/scrollSync.worker?worker';
import { queryHTMLElements } from './dom';

interface LineMapEntry {
    line: number;
    y: number;
}

interface SyncMessage {
    type: 'sync';
    direction: 'editor-to-preview' | 'preview-to-editor';
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    totalLines: number;
}

interface UpdateMapMessage {
    type: 'update-map';
    lineMap: LineMapEntry[];
}

interface SyncResultMessage {
    type: 'sync-result';
    targetScrollTop: number;
    direction: 'editor-to-preview' | 'preview-to-editor';
}

export class ScrollSyncManager {
    editor = $state<EditorView | null>(null);
    preview = $state<HTMLElement | null>(null);
    private lineMap: LineMapEntry[] = [];

    // Web Worker for interpolation calculations
    private worker: Worker | null = null;
    private pendingSyncs = new SvelteMap<
        string,
        { target: HTMLElement | Element; direction: 'editor-to-preview' | 'preview-to-editor' }
    >();

    // State to prevent circular scroll loops
    private activeSource = $state<'editor' | 'preview' | null>(null);
    private clearSourceTimer: number | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private updateMapTimer: number | null = null;
    private mapDirty = $state(false);

    // Smooth scroll animation state
    private smoothScrollRAF: number | null = null;
    private smoothScrollTarget: { element: HTMLElement | Element; targetY: number } | null = null;

    constructor() {
        // Initialize Web Worker
        this.initWorker();

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
                        if (this.updateMapTimer) {
                            clearTimeout(this.updateMapTimer);
                            this.updateMapTimer = null;
                        }
                    };
                }
            });
        });
    }

    private initWorker() {
        try {
            this.worker = new ScrollSyncWorker();
            this.worker.onmessage = (event: MessageEvent<SyncResultMessage>) => {
                this.handleWorkerResult(event.data);
            };
            this.worker.onerror = (err) => {
                console.error('[ScrollSync] Worker error:', err);
                this.fallbackToMainThread();
            };
        } catch (err) {
            console.warn(
                '[ScrollSync] Failed to initialize worker, falling back to main thread:',
                err,
            );
            this.fallbackToMainThread();
        }
    }

    private fallbackToMainThread() {
        // If worker fails, we'll do calculations on main thread
        this.worker = null;
    }

    private handleWorkerResult(data: SyncResultMessage) {
        if (data.type !== 'sync-result') return;

        const pending = this.pendingSyncs.get(data.direction);
        if (!pending) return;

        this.pendingSyncs.delete(data.direction);

        const { target, direction } = pending;
        let targetY = data.targetScrollTop;

        if (direction === 'editor-to-preview') {
            if (targetY === -1) {
                targetY = target.scrollHeight - target.clientHeight;
            }
        } else {
            if (!this.editor) return;
            if (targetY === -1) {
                targetY = this.editor.scrollDOM.scrollHeight - this.editor.scrollDOM.clientHeight;
            } else {
                const docLines = this.editor.state.doc.lines;
                const safeLine = Math.max(1, Math.min(targetY, docLines));
                const lineInt = Math.floor(safeLine);
                const lineFrac = safeLine - lineInt;
                const lineInfo = this.editor.lineBlockAt(this.editor.state.doc.line(lineInt).from);
                targetY = lineInfo.top + lineInfo.height * lineFrac;
            }
        }

        if (Math.abs(target.scrollTop - targetY) > CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX) {
            this.smoothScrollTo(target, targetY);
        }
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
        }

        this.preview = el;
        this.onPreviewScroll = this.onPreviewScroll.bind(this);
        el.addEventListener('scroll', this.onPreviewScroll, { passive: true });
    }

    updateMap() {
        if (!this.preview || !this.editor) return;

        const container = this.preview;
        const containerRect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;

        const elements = queryHTMLElements(container, '[data-sourcepos]');

        const rawMap: LineMapEntry[] = [];
        for (const el of elements) {
            const sourcepos = el.getAttribute('data-sourcepos');
            if (!sourcepos) continue;
            const match = sourcepos.match(/^(\d+):\d+-\d+:\d+$/);
            if (!match) continue;
            const line = parseInt(match[1], 10);
            if (isNaN(line)) continue;

            const rect = el.getBoundingClientRect();
            const y = rect.top - containerRect.top + scrollTop;
            rawMap.push({ line, y });
        }

        if (rawMap.length > 0) {
            rawMap.sort((a, b) => a.line - b.line);

            const seen: Record<number, boolean> = {};
            this.lineMap = [];
            for (const entry of rawMap) {
                if (!seen[entry.line]) {
                    seen[entry.line] = true;
                    this.lineMap.push(entry);
                }
            }
        } else {
            this.lineMap = [];
        }

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

        if (this.worker) {
            const message: UpdateMapMessage = {
                type: 'update-map',
                lineMap: this.lineMap,
            };
            this.worker.postMessage(message);
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
        }, 200);
    }

    private smoothScrollTo(element: HTMLElement | Element, targetY: number, instant = false) {
        const currentY = element.scrollTop;
        const diff = Math.abs(targetY - currentY);

        if (diff < CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX) return;

        if (instant || diff < 50) {
            element.scrollTop = targetY;
            return;
        }

        if (
            this.smoothScrollTarget &&
            this.smoothScrollTarget.element === element &&
            Math.abs(this.smoothScrollTarget.targetY - targetY) < 100
        ) {
            this.smoothScrollTarget.targetY = targetY;
            return;
        }

        if (this.smoothScrollRAF) {
            cancelAnimationFrame(this.smoothScrollRAF);
        }

        this.smoothScrollTarget = { element, targetY };

        const startY = currentY;
        const duration = Math.min(150, Math.max(50, diff / 10));
        const startTime = performance.now();

        const animate = (now: number) => {
            if (!this.smoothScrollTarget || this.smoothScrollTarget.element !== element) {
                return;
            }

            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - progress, 3);

            const currentTargetY = this.smoothScrollTarget.targetY;
            const y = startY + (currentTargetY - startY) * eased;

            element.scrollTop = y;

            if (progress < 1) {
                this.smoothScrollRAF = requestAnimationFrame(animate);
            } else {
                this.smoothScrollRAF = null;
                this.smoothScrollTarget = null;
            }
        };

        this.smoothScrollRAF = requestAnimationFrame(animate);
    }

    private syncPreview() {
        if (!this.editor || !this.preview) return;

        const source = this.editor.scrollDOM;
        const target = this.preview;
        const direction = 'editor-to-preview';

        const scrollTop = source.scrollTop;
        const scrollHeight = source.scrollHeight;
        const clientHeight = source.clientHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (scrollTop <= 0) {
            if (target.scrollTop > 0) {
                this.smoothScrollTo(target, 0, true);
            }
            return;
        }
        if (scrollTop >= maxScroll - 1) {
            const targetBottom = target.scrollHeight - target.clientHeight;
            if (Math.abs(target.scrollTop - targetBottom) > 2) {
                this.smoothScrollTo(target, targetBottom, true);
            }
            return;
        }

        if (!this.worker) {
            this.syncScrollPositionFallback(source, target, direction);
            return;
        }

        const lineBlock = this.editor.lineBlockAtHeight(scrollTop);
        const docLine = this.editor.state.doc.lineAt(lineBlock.from);
        const fraction = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
        const currentLine = docLine.number + fraction;

        this.pendingSyncs.set(direction, { target, direction });

        const message: SyncMessage = {
            type: 'sync',
            direction,
            scrollTop: currentLine,
            scrollHeight,
            clientHeight,
            totalLines: this.editor.state.doc.lines,
        };
        this.worker.postMessage(message);
    }

    private syncEditor() {
        if (!this.editor || !this.preview) return;

        const source = this.preview;
        const target = this.editor.scrollDOM;
        const direction = 'preview-to-editor';

        const scrollTop = source.scrollTop;
        const scrollHeight = source.scrollHeight;
        const clientHeight = source.clientHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (scrollTop <= 0) {
            if (target.scrollTop > 0) {
                this.smoothScrollTo(target, 0, true);
            }
            return;
        }
        if (scrollTop >= maxScroll - 1) {
            const targetBottom = target.scrollHeight - target.clientHeight;
            if (Math.abs(target.scrollTop - targetBottom) > 2) {
                this.smoothScrollTo(target, targetBottom, true);
            }
            return;
        }

        if (!this.worker || this.lineMap.length < 2) {
            this.syncScrollPositionFallback(source, target, direction);
            return;
        }

        this.pendingSyncs.set(direction, { target, direction });

        const message: SyncMessage = {
            type: 'sync',
            direction,
            scrollTop,
            scrollHeight,
            clientHeight,
            totalLines: this.editor.state.doc.lines,
        };
        this.worker.postMessage(message);
    }

    private syncScrollPositionFallback(
        source: HTMLElement,
        target: HTMLElement,
        direction: 'editor-to-preview' | 'preview-to-editor',
    ) {
        const scrollTop = source.scrollTop;
        const scrollHeight = source.scrollHeight;
        const clientHeight = source.clientHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (this.lineMap.length < 2) {
            const pct = scrollTop / maxScroll;
            const targetMax = target.scrollHeight - target.clientHeight;
            const targetTop = pct * targetMax;
            if (
                Math.abs(target.scrollTop - targetTop) > CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX
            ) {
                this.smoothScrollTo(target, targetTop);
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
            this.smoothScrollTo(target, targetY);
        }
    }

    private interpolate(val: number, inputKey: 'line' | 'y', outputKey: 'line' | 'y'): number {
        const map = this.lineMap;
        let lo = 0;
        let hi = map.length - 1;

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
