import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const HEADING_NODE_NAMES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
]);

const MARKER_CONFIG: Array<{ marker: string; parents: ReadonlySet<string> }> = [
  { marker: 'EmphasisMark', parents: new Set(['Emphasis', 'StrongEmphasis']) },
  {
    marker: 'HeaderMark',
    parents: new Set(['ATXHeading1', 'ATXHeading2', 'ATXHeading3', 'ATXHeading4', 'ATXHeading5', 'ATXHeading6']),
  },
  { marker: 'LinkMark', parents: new Set(['Autolink']) },
  { marker: 'QuoteMark', parents: new Set(['Blockquote']) },
  { marker: 'CodeMark', parents: new Set(['InlineCode', 'FencedCode']) },
];

const HIDE_TRAILING_SPACE = new Set(['HeaderMark', 'QuoteMark']);

const highlightDeco = Decoration.mark({ class: 'cm-highlight' });
const strikethroughDeco = Decoration.mark({ class: 'cm-strikethrough' });
const blockquoteQuoteDeco = Decoration.line({ class: 'cm-blockquote-quote' });
const blockquoteBgDeco = Decoration.mark({ class: 'cm-blockquote-bg' });
const codeBlockLineDeco = Decoration.line({ class: 'cm-code-block' });
const inlineCodeDeco = Decoration.mark({ class: 'cm-code' });
const codeInfoDeco = Decoration.mark({ class: 'cm-code-info' });
const horizontalRuleDeco = Decoration.mark({ class: 'cm-hr cm-hr-raw' });
const horizontalRuleMaskedDeco = Decoration.mark({ class: 'cm-hr cm-hr-mask' });
const bulletPointDeco = Decoration.mark({ class: 'cm-bullet' });
const headingRawDeco = Decoration.mark({ class: 'cm-heading-raw' });
const formattingMaskDeco = Decoration.mark({ class: 'cm-formatting-mask' });

const bqMatchRe = /^\s*> ?/;
const bulletMatchRe = /^(\s*)-\s/;
const hlRegex = /==([^=]+)==/g;
const stRegex = /~~([^~]+)~~/g;

function findCursorHeadingLines(view: EditorView): Set<number> {
  const headings = new Set<number>();
  const cursor = view.state.selection.main.head;
  const tree = syntaxTree(view.state);
  const node = tree.resolveInner(cursor, -1);
  let current: typeof node | null = node;
  while (current) {
    if (HEADING_NODE_NAMES.has(current.name)) {
      const fromLine = view.state.doc.lineAt(current.from);
      const toLine = view.state.doc.lineAt(current.to);
      for (let i = fromLine.number; i <= toLine.number; i++) {
        headings.add(i);
      }
      break;
    }
    current = current.parent;
  }
  return headings;
}

function isVisibleInCodeBlock(tree: ReturnType<typeof syntaxTree>, pos: number): boolean {
  const node = tree.resolveInner(pos, 1);
  return node.name === 'FencedCode' || node.name === 'InlineCode' || node.name === 'CodeBlock';
}

function findHiddenMarkers(view: EditorView, tree: ReturnType<typeof syntaxTree>, ranges: Range<Decoration>[]) {
  const cursor = view.state.selection.main.head;
  const usedParents = new Set<string>();

  for (const cfg of MARKER_CONFIG) {
    for (const p of cfg.parents) usedParents.add(p);
  }

  const hiddenParents: Array<{ from: number; to: number }> = [];

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (!usedParents.has(node.name)) return;
        if (cursor >= node.from && cursor <= node.to) return false;
        hiddenParents.push({ from: node.from, to: node.to });
        return false;
      },
    });
  }

  if (hiddenParents.length === 0) return;

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const cfg = MARKER_CONFIG.find((c) => c.marker === node.name);
        if (!cfg) return;
        for (const p of hiddenParents) {
          if (node.from >= p.from && node.to <= p.to) {
            ranges.push(formattingMaskDeco.range(node.from, node.to));
            if (HIDE_TRAILING_SPACE.has(cfg.marker)) {
              const after = view.state.doc.sliceString(node.to, node.to + 1);
              if (after === ' ') {
                ranges.push(formattingMaskDeco.range(node.to, node.to + 1));
              }
            }
            break;
          }
        }
      },
    });
  }
}

function buildDecorations(view: EditorView, rendered: boolean): DecorationSet {
  if (!rendered) return Decoration.set([]);

  const tree = syntaxTree(view.state);
  const ranges: Range<Decoration>[] = [];
  const cursorHeadingLines = findCursorHeadingLines(view);

  findHiddenMarkers(view, tree, ranges);

  const codeBlockLines = new Set<number>();
  const parserHrs = new Set<number>();
  const blockquoteLines = new Set<number>();
  const cursor = view.state.selection.main.head;

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
        } else if (node.name === 'InlineCode') {
          ranges.push(inlineCodeDeco.range(node.from, node.to));
        } else if (node.name === 'CodeInfo') {
          ranges.push(codeInfoDeco.range(node.from, node.to));
        } else if (node.name === 'HorizontalRule') {
          parserHrs.add(node.from);
        } else if (node.name === 'Blockquote') {
          if (!(cursor >= node.from && cursor <= node.to)) {
            const fromLine = view.state.doc.lineAt(node.from);
            const toLine = view.state.doc.lineAt(node.to);
            for (let i = fromLine.number; i <= toLine.number; i++) {
              blockquoteLines.add(i);
            }
          }
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

      if (cursorHeadingLines.has(line.number)) {
        ranges.push(headingRawDeco.range(line.from, line.to));
      }

      const bqMatch = bqMatchRe.exec(line.text);
      if (bqMatch) {
        ranges.push(blockquoteBgDeco.range(line.from, line.to));
        if (blockquoteLines.has(line.number)) {
          ranges.push(blockquoteQuoteDeco.range(line.from));
        }
      }

      const bulletMatch = bulletMatchRe.exec(line.text);
      if (bulletMatch) {
        const dashStart = line.from + bulletMatch[1].length;
        const nearMarker = cursor >= dashStart && cursor <= dashStart + 1;
        if (!nearMarker) {
          ranges.push(bulletPointDeco.range(dashStart, dashStart + 1));
        }
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
          if (!(cursor >= start && cursor <= end)) {
            ranges.push(formattingMaskDeco.range(start, start + 2));
            ranges.push(formattingMaskDeco.range(end - 2, end));
          }
        }
      }

      stRegex.lastIndex = 0;
      while (true) {
        match = stRegex.exec(line.text);
        if (match === null) break;
        const start = line.from + match.index;
        const end = start + match[0].length;
        if (!isVisibleInCodeBlock(tree, start)) {
          ranges.push(strikethroughDeco.range(start, end));
          if (!(cursor >= start && cursor <= end)) {
            ranges.push(formattingMaskDeco.range(start, start + 2));
            ranges.push(formattingMaskDeco.range(end - 2, end));
          }
        }
      }

      if (parserHrs.has(line.from) || line.text.trim() === '---') {
        const onLine = cursor >= line.from && cursor <= line.to;
        ranges.push((onLine ? horizontalRuleDeco : horizontalRuleMaskedDeco).range(line.from, line.to));
      }

      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

export function createMarkdownDecorationsPlugin(rendered: boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, rendered);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view, rendered);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
