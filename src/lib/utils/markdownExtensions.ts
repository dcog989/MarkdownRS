import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, MatchDecorator, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

// Decorator for ==highlight== syntax
const highlightMatcher = new MatchDecorator({
    regexp: /==([^=]+)==/g,
    decoration: (match) => Decoration.mark({
        class: "cm-highlight"
    })
});

export const highlightPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
        this.decorations = highlightMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
        this.decorations = highlightMatcher.updateDeco(update, this.decorations);
    }
}, {
    decorations: v => v.decorations
});

// Decorator for Blockquote lines (whole line styling)
const blockquoteLineDeco = Decoration.line({
    class: "cm-blockquote-line"
});

function getBlockquoteDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
            const line = view.state.doc.lineAt(pos);
            if (/^\s*>/.test(line.text)) {
                builder.add(line.from, line.from, blockquoteLineDeco);
            }
            pos = line.to + 1;
        }
    }
    return builder.finish();
}

export const blockquotePlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
        this.decorations = getBlockquoteDecorations(view);
    }
    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = getBlockquoteDecorations(update.view);
        }
    }
}, {
    decorations: v => v.decorations
});
