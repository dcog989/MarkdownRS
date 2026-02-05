import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
    Decoration,
    ViewPlugin,
    type DecorationSet,
    type EditorView,
    type ViewUpdate,
} from '@codemirror/view';

function isVisibleInCodeBlock(tree: ReturnType<typeof syntaxTree>, pos: number): boolean {
    const node = tree.resolveInner(pos, 1);
    return node.name === 'FencedCode' || node.name === 'InlineCode' || node.name === 'CodeBlock';
}

function iterateVisibleLines(
    view: EditorView,
    callback: (line: { from: number; to: number; text: string; number: number }) => void,
) {
    for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
            const line = view.state.doc.lineAt(pos);
            callback(line);
            pos = line.to + 1;
        }
    }
}

function iterateVisibleNodes(
    view: EditorView,
    callback: (node: { from: number; to: number; name: string }) => void | boolean,
) {
    const tree = syntaxTree(view.state);
    for (const { from, to } of view.visibleRanges) {
        tree.iterate({
            from,
            to,
            enter: (node) => callback(node),
        });
    }
}

function createDecoPlugin(getDecorations: (view: EditorView) => DecorationSet) {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            constructor(view: EditorView) {
                this.decorations = getDecorations(view);
            }
            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = getDecorations(update.view);
                }
            }
        },
        {
            decorations: (v) => v.decorations,
        },
    );
}

const highlightDeco = Decoration.mark({ class: 'cm-highlight' });

function getHighlightDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const tree = syntaxTree(view.state);

    iterateVisibleLines(view, (line) => {
        const regex = /==([^=]+)==/g;
        let match;

        while ((match = regex.exec(line.text)) !== null) {
            const start = line.from + match.index;
            const end = start + match[0].length;

            if (isVisibleInCodeBlock(tree, start)) {
                continue;
            }

            builder.add(start, end, highlightDeco);
        }
    });

    return builder.finish();
}

export const highlightPlugin = createDecoPlugin(getHighlightDecorations);

const blockquoteBorderDeco = Decoration.mark({ class: 'cm-blockquote-border' });
const blockquoteBgDeco = Decoration.mark({ class: 'cm-blockquote-bg' });

function getBlockquoteDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();

    iterateVisibleLines(view, (line) => {
        const match = /^\s*> ?/.exec(line.text);
        if (match) {
            builder.add(
                line.from + match.index,
                line.from + match.index + match[0].length,
                blockquoteBorderDeco,
            );
            builder.add(line.from, line.to, blockquoteBgDeco);
        }
    });

    return builder.finish();
}

export const blockquotePlugin = createDecoPlugin(getBlockquoteDecorations);

const codeBlockMarkDeco = Decoration.mark({
    class: 'cm-code',
});

function getCodeBlockDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    let lastPos = -1;

    iterateVisibleNodes(view, (node) => {
        if (node.name === 'FencedCode') {
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
    });

    return builder.finish();
}

export const codeBlockPlugin = createDecoPlugin(getCodeBlockDecorations);

function getInlineCodeDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();

    iterateVisibleNodes(view, (node) => {
        if (node.name === 'InlineCode') {
            builder.add(node.from, node.to, codeBlockMarkDeco);
        }
    });

    return builder.finish();
}

export const inlineCodePlugin = createDecoPlugin(getInlineCodeDecorations);

const horizontalRuleDeco = Decoration.mark({ class: 'cm-hr' });

function getHorizontalRuleDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();

    iterateVisibleNodes(view, (node) => {
        if (node.name === 'HorizontalRule') {
            builder.add(node.from, node.to, horizontalRuleDeco);
        }
    });

    return builder.finish();
}

export const horizontalRulePlugin = createDecoPlugin(getHorizontalRuleDecorations);

const bulletPointDeco = Decoration.mark({ class: 'cm-bullet' });

function getBulletPointDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();

    iterateVisibleLines(view, (line) => {
        const match = /^(\s*)-\s/.exec(line.text);
        if (match) {
            const dashStart = line.from + match[1].length;
            const dashEnd = dashStart + 1;
            builder.add(dashStart, dashEnd, bulletPointDeco);
        }
    });

    return builder.finish();
}

export const bulletPointPlugin = createDecoPlugin(getBulletPointDecorations);
