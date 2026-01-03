import { EditorView } from "@codemirror/view";

export type RestoreStrategy = 'pixel' | 'anchor' | 'auto';

export class ScrollManager {
    private snapshot: { scrollTop: number; anchorLine: number; anchorOffset: number; totalLines: number } | null = null;

    public capture(view: EditorView, context: string) {
        if (!view.scrollDOM) return;

        const dom = view.scrollDOM;
        const scrollTop = dom.scrollTop;

        const block = view.lineBlockAtHeight(scrollTop);
        const line = view.state.doc.lineAt(block.from);

        this.snapshot = {
            scrollTop: scrollTop,
            anchorLine: line.number,
            anchorOffset: scrollTop - block.top,
            totalLines: view.state.doc.lines
        };
    }

    public restore(view: EditorView, strategy: RestoreStrategy = 'auto') {
        if (!this.snapshot || !view.scrollDOM) {
            return;
        }

        const target = this.snapshot;

        requestAnimationFrame(() => {
            if (!view.scrollDOM) return;

            view.requestMeasure({
                read: () => {
                    const currentDoc = view.state.doc;
                    const currentLines = currentDoc.lines;
                    const scrollHeight = view.scrollDOM.scrollHeight;
                    const clientHeight = view.scrollDOM.clientHeight;

                    let effectiveStrategy = strategy;
                    let reason = "Manual override";

                    if (strategy === 'auto') {
                        if (currentLines !== target.totalLines) {
                            effectiveStrategy = 'anchor';
                            reason = `Line count changed (${target.totalLines} -> ${currentLines})`;
                        } else {
                            effectiveStrategy = 'pixel';
                            reason = "Line count stable";
                        }
                    }

                    let targetTop = target.scrollTop;
                    let logDetail = "";

                    if (effectiveStrategy === 'anchor') {
                        try {
                            const safeLine = Math.max(1, Math.min(target.anchorLine, currentLines));
                            const lineInfo = currentDoc.line(safeLine);
                            const block = view.lineBlockAt(lineInfo.from);
                            targetTop = block.top + target.anchorOffset;
                            logDetail = `Line ${safeLine} @ ${block.top} + ${target.anchorOffset} = ${targetTop}`;
                        } catch (e) {
                            targetTop = target.scrollTop; // Fallback
                            logDetail = "Error (Fallback to pixel)";
                        }
                    } else {
                        logDetail = `Pixel: ${target.scrollTop}`;
                    }

                    // Clamp
                    const maxScroll = Math.max(0, scrollHeight - clientHeight);
                    const clampedTop = Math.max(0, Math.min(targetTop, maxScroll));

                    if (clampedTop !== targetTop) {
                        logDetail += ` (Clamped to ${clampedTop} from ${targetTop})`;
                    }

                    return {
                        targetTop: clampedTop,
                        strategy: effectiveStrategy,
                        reason,
                        logDetail,
                        domReady: scrollHeight > clientHeight
                    };
                },
                write: ({ targetTop, strategy, reason, logDetail, domReady }) => {

                    if (!domReady && targetTop > 0) {
                    }

                    view.scrollDOM.scrollTop = targetTop;

                    // Verify
                    if (targetTop > 0 && view.scrollDOM.scrollTop === 0) {
                        requestAnimationFrame(() => {
                            if (view.scrollDOM) {
                                view.scrollDOM.scrollTop = targetTop;
                            }
                        });
                    }
                }
            });
        });
    }

    public getSnapshot() {
        return this.snapshot;
    }
}
