import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

function isVisibleInCodeBlock(tree: ReturnType<typeof syntaxTree>, pos: number): boolean {
  const node = tree.resolveInner(pos, 1);
  return node.name === 'FencedCode' || node.name === 'InlineCode' || node.name === 'CodeBlock';
}

const highlightDeco = Decoration.mark({ class: 'cm-highlight' });
const blockquoteBorderDeco = Decoration.mark({ class: 'cm-blockquote-border' });
const blockquoteBgDeco = Decoration.mark({ class: 'cm-blockquote-bg' });
const codeBlockLineDeco = Decoration.line({ class: 'cm-code-block' });
const horizontalRuleDeco = Decoration.mark({ class: 'cm-hr' });
const bulletPointDeco = Decoration.mark({ class: 'cm-bullet' });

function buildAllDecorations(view: EditorView): DecorationSet {
  const tree = syntaxTree(view.state);
  const builder = new RangeSetBuilder<Decoration>();

  const codeBlockLines = new Set<number>();
  const parserHrs = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === 'FencedCode') {
          const fromLine = view.state.doc.lineAt(node.from);
          const toLine = view.state.doc.lineAt(node.to);
          for (let i = fromLine.number; i <= toLine.number; i++) {
            codeBlockLines.add(i);
          }
        } else if (node.name === 'HorizontalRule') {
          parserHrs.add(node.from);
        }
      },
    });
  }

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);

      const bqMatch = /^\s*> ?/.exec(line.text);
      if (bqMatch) {
        builder.add(line.from + bqMatch.index, line.from + bqMatch.index + bqMatch[0].length, blockquoteBorderDeco);
        builder.add(line.from, line.to, blockquoteBgDeco);
      }

      const bulletMatch = /^(\s*)-\s/.exec(line.text);
      if (bulletMatch) {
        const dashStart = line.from + bulletMatch[1].length;
        builder.add(dashStart, dashStart + 1, bulletPointDeco);
      }

      const hlRegex = /==([^=]+)==/g;
      let match: RegExpExecArray | null;
      while (true) {
        match = hlRegex.exec(line.text);
        if (match === null) break;
        const start = line.from + match.index;
        const end = start + match[0].length;
        if (!isVisibleInCodeBlock(tree, start)) {
          builder.add(start, end, highlightDeco);
        }
      }

      if (codeBlockLines.has(line.number)) {
        builder.add(line.from, line.from, codeBlockLineDeco);
      }

      if (parserHrs.has(line.from)) {
        builder.add(line.from, line.to, horizontalRuleDeco);
      } else if (line.text.trim() === '---') {
        builder.add(line.from, line.to, horizontalRuleDeco);
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

export const markdownDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildAllDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildAllDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
