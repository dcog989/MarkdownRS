import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
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

const bqMatchRe = /^\s*> ?/;
const bulletMatchRe = /^(\s*)-\s/;
const hlRegex = /==([^=]+)==/g;

function buildAllDecorations(view: EditorView): DecorationSet {
  const tree = syntaxTree(view.state);
  const ranges: Range<Decoration>[] = [];

  const codeBlockLines = new Set<number>();
  const parserHrs = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === 'FencedCode') {
          const start = Math.max(node.from, from);
          const end = Math.min(node.to, to);
          const fromLine = view.state.doc.lineAt(start);
          const toLine = view.state.doc.lineAt(end);
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

      if (codeBlockLines.has(line.number)) {
        ranges.push(codeBlockLineDeco.range(line.from));
      }

      const bqMatch = bqMatchRe.exec(line.text);
      if (bqMatch) {
        ranges.push(blockquoteBgDeco.range(line.from, line.to));
        ranges.push(
          blockquoteBorderDeco.range(line.from + bqMatch.index, line.from + bqMatch.index + bqMatch[0].length),
        );
      }

      const bulletMatch = bulletMatchRe.exec(line.text);
      if (bulletMatch) {
        const dashStart = line.from + bulletMatch[1].length;
        ranges.push(bulletPointDeco.range(dashStart, dashStart + 1));
      }

      hlRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while (true) {
        match = hlRegex.exec(line.text);
        if (match === null) break;

        const start = line.from + match.index;
        const end = start + match[0].length;
        if (!isVisibleInCodeBlock(tree, start)) {
          ranges.push(highlightDeco.range(start, end));
        }
      }

      if (parserHrs.has(line.from)) {
        ranges.push(horizontalRuleDeco.range(line.from, line.to));
      } else if (line.text.trim() === '---') {
        ranges.push(horizontalRuleDeco.range(line.from, line.to));
      }

      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
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
