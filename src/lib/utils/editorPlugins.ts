import { appContext } from "$lib/stores/state.svelte.ts";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

class NewlineWidget extends WidgetType {
    toDOM() {
        const span = document.createElement("span");
        span.className = "cm-newline";
        span.textContent = "¬";
        return span;
    }
}

function getNewlineDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
            const line = view.state.doc.lineAt(pos);
            if (line.to < view.state.doc.length) {
                builder.add(line.to, line.to, Decoration.widget({ widget: new NewlineWidget(), side: 1 }));
            }
            pos = line.to + 1;
        }
    }
    return builder.finish();
}

export const newlinePlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
            this.decorations = getNewlineDecorations(view);
        }
        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = getNewlineDecorations(update.view);
            }
        }
    },
    { decorations: (v) => v.decorations }
);

export const rulerPlugin = ViewPlugin.fromClass(
    class {
        ruler: HTMLElement;
        gutters: HTMLElement | null;
        constructor(view: EditorView) {
            this.ruler = document.createElement("div");
            this.ruler.className = "cm-ruler-line";
            this.ruler.style.position = "absolute";
            this.ruler.style.top = "0";
            this.ruler.style.bottom = "0";
            this.ruler.style.width = "1px";
            this.ruler.style.backgroundColor = "var(--color-border-light)";
            this.ruler.style.opacity = "0.3";
            this.ruler.style.pointerEvents = "none";
            this.ruler.style.display = "none";
            this.ruler.style.zIndex = "0";
            view.scrollDOM.appendChild(this.ruler);
            this.gutters = view.dom.querySelector(".cm-gutters") as HTMLElement;
            this.measure(view);
        }
        update(update: ViewUpdate) {
            if (update.geometryChanged || update.viewportChanged) {
                this.measure(update.view);
            }
        }
        measure(view: EditorView) {
            const column = appContext.app.wrapGuideColumn;
            if (column > 0) {
                const charWidth = view.defaultCharacterWidth;
                const gutterWidth = this.gutters?.offsetWidth || 0;
                const style = window.getComputedStyle(view.contentDOM);
                const paddingLeft = parseFloat(style.paddingLeft) || 0;
                const left = gutterWidth + paddingLeft + column * charWidth;
                this.ruler.style.left = `${left}px`;
                this.ruler.style.display = "block";
            } else {
                this.ruler.style.display = "none";
            }
        }
        destroy() {
            this.ruler.remove();
        }
    }
);
