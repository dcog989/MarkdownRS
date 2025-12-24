import { syntaxTree } from "@codemirror/language";
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

// Blockquote Styling
// We use two marks: one for the border (applied to the '> ') and one for the background (applied to the whole line content)
const blockquoteBorderDeco = Decoration.mark({ class: "cm-blockquote-border" });
const blockquoteBgDeco = Decoration.mark({ class: "cm-blockquote-bg" });

function getBlockquoteDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
            const line = view.state.doc.lineAt(pos);
            const match = /^\s*> ?/.exec(line.text);
            if (match) {
                // Apply border style to the "> " part
                builder.add(line.from + match.index, line.from + match.index + match[0].length, blockquoteBorderDeco);
                // Apply background style to the entire content of the line
                builder.add(line.from, line.to, blockquoteBgDeco);
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

// Decorator for Fenced Code Block content (content width only)
const codeBlockMarkDeco = Decoration.mark({
    class: "cm-code"
});

function getCodeBlockDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const tree = syntaxTree(view.state);
    let lastPos = -1;

    for (const { from, to } of view.visibleRanges) {
        tree.iterate({
            from, to,
            enter: (node) => {
                if (node.name === "FencedCode") {
                    const startLine = view.state.doc.lineAt(node.from);
                    const endLine = view.state.doc.lineAt(node.to);

                    for (let i = startLine.number; i <= endLine.number; i++) {
                        const line = view.state.doc.line(i);
                        // Ensure we don't add duplicate marks if ranges overlap
                        if (line.from > lastPos) {
                            builder.add(line.from, line.to, codeBlockMarkDeco);
                            lastPos = line.from;
                        }
                    }
                }
            }
        });
    }
    return builder.finish();
}

export const codeBlockPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
        this.decorations = getCodeBlockDecorations(view);
    }
    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = getCodeBlockDecorations(update.view);
        }
    }
}, {
    decorations: v => v.decorations
});
