import type { EditorView } from "@codemirror/view";
import { Decoration, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

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
