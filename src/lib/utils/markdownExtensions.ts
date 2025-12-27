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
const blockquoteBorderDeco = Decoration.mark({ class: "cm-blockquote-border" });
const blockquoteBgDeco = Decoration.mark({ class: "cm-blockquote-bg" });

function getBlockquoteDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
            const line = view.state.doc.lineAt(pos);
            const match = /^\s*> ?/.exec(line.text);
            if (match) {
                builder.add(line.from + match.index, line.from + match.index + match[0].length, blockquoteBorderDeco);
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

// Plugin for Inline Code `...` to ensure backticks are colored
function getInlineCodeDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const tree = syntaxTree(view.state);

    for (const { from, to } of view.visibleRanges) {
        tree.iterate({
            from, to,
            enter: (node) => {
                // InlineCode encompasses the backticks and content
                if (node.name === "InlineCode") {
                    builder.add(node.from, node.to, codeBlockMarkDeco);
                }
            }
        });
    }
    return builder.finish();
}

export const inlineCodePlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
        this.decorations = getInlineCodeDecorations(view);
    }
    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = getInlineCodeDecorations(update.view);
        }
    }
}, {
    decorations: v => v.decorations
});

// Horizontal Rule Styling (---, -----, etc.)
const horizontalRuleDeco = Decoration.mark({ class: "cm-hr" });

function getHorizontalRuleDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const tree = syntaxTree(view.state);

    for (const { from, to } of view.visibleRanges) {
        tree.iterate({
            from, to,
            enter: (node) => {
                if (node.name === "HorizontalRule") {
                    builder.add(node.from, node.to, horizontalRuleDeco);
                }
            }
        });
    }
    return builder.finish();
}

export const horizontalRulePlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
        this.decorations = getHorizontalRuleDecorations(view);
    }
    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = getHorizontalRuleDecorations(update.view);
        }
    }
}, {
    decorations: v => v.decorations
});

// Bullet Point Styling (- at start of line)
const bulletPointDeco = Decoration.mark({ class: "cm-bullet" });

function getBulletPointDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
            const line = view.state.doc.lineAt(pos);
            // Match lines starting with optional whitespace, then a dash, then a space
            const match = /^(\s*)-\s/.exec(line.text);
            if (match) {
                // Style only the dash character itself
                const dashStart = line.from + match[1].length;
                const dashEnd = dashStart + 1;
                builder.add(dashStart, dashEnd, bulletPointDeco);
            }
            pos = line.to + 1;
        }
    }
    return builder.finish();
}

export const bulletPointPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
        this.decorations = getBulletPointDecorations(view);
    }
    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = getBulletPointDecorations(update.view);
        }
    }
}, {
    decorations: v => v.decorations
});
