import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { translate } from '$lib/i18n';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import type { AppEditorView } from '../../global';
import { imageWidgetClickHandler, imageWidgetDecoration } from './markdownImageWidget';
import { collectTableSpans, createTableWidgetField, tableWidgetClickHandler } from './markdownTableWidget';
import { resolveImageSrc } from './resolveImagePath';

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
const blockquoteBgDeco = Decoration.line({ class: 'cm-blockquote-bg' });
const codeBlockLineDeco = Decoration.line({ class: 'cm-code-block' });
const inlineCodeDeco = Decoration.mark({ class: 'cm-code' });
const codeInfoDeco = Decoration.mark({ class: 'cm-code-info' });
const horizontalRuleDeco = Decoration.mark({ class: 'cm-hr cm-hr-raw' });
const horizontalRuleMaskedDeco = Decoration.mark({ class: 'cm-hr cm-hr-mask' });
const bulletPointDeco = Decoration.replace({
  widget: new (class extends WidgetType {
    toDOM() {
      const span = document.createElement('span');
      span.className = 'cm-bullet-widget';
      span.textContent = '\u2022';
      return span;
    }
  })(),
});
const headingRawDeco = Decoration.mark({ class: 'cm-heading-raw' });
const formattingMaskDeco = Decoration.replace({});
const formattingMaskAutolinkDeco = Decoration.replace({ inclusive: true });
// Inclusive so clicks at the end of a hidden URL range map past it instead of
// jumping to the start (e.g. before '(') — same fix as the autolink brackets.
const linkUrlMaskDeco = Decoration.replace({ inclusive: true });
const linkTextDeco = Decoration.mark({ class: 'cm-link-text' });
const linkTextTheme = EditorView.baseTheme({
  '.cm-link-text': {
    color: 'var(--editor-link)',
    textDecoration: 'underline',
  },
  '&.cm-modifier-down .cm-link-text': {
    cursor: 'pointer',
  },
});

const bqMatchRe = /^\s*> ?/;
const bulletMatchRe = /^(\s*)-\s/;
const hlRegex = /==([^=]+)==/g;
const stRegex = /~~([^~]+)~~/g;

const CALLOUT_STYLES: Record<string, { title: string; icon: string }> = {
  note: {
    title: 'Note',
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  },
  tip: {
    title: 'Tip',
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>',
  },
  important: {
    title: 'Important',
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  },
  warning: {
    title: 'Warning',
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.7 18.5 13.5 4.4a1.9 1.9 0 0 0-3 0L2.3 18.5A1.9 1.9 0 0 0 4 21h16a1.9 1.9 0 0 0 1.7-2.5z"/><path d="M12 9v4M12 17h.01"/></svg>',
  },
  caution: {
    title: 'Caution',
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 2h8.2L22 7.9v8.2l-5.9 5.9H7.9L2 16.1V7.9z"/><path d="M12 8v4M12 16h.01"/></svg>',
  },
};

const calloutMatchRe = /^(\s*>\s*)(\[!(note|tip|important|warning|caution)\])(.*)$/i;

export function matchCalloutLine(text: string): { start: number; raw: string; kind: string } | null {
  const m = calloutMatchRe.exec(text);
  if (!m) return null;
  return { start: m[1].length, raw: m[2], kind: m[3].toLowerCase() };
}

class CalloutTitleWidget extends WidgetType {
  constructor(
    private readonly kind: string,
    private readonly title: string,
  ) {
    super();
  }

  eq(other: CalloutTitleWidget): boolean {
    return other.kind === this.kind && other.title === this.title;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `cm-callout-title cm-callout-${this.kind}`;
    span.innerHTML = `${CALLOUT_STYLES[this.kind].icon}<span class="cm-callout-title-text">${this.title}</span>`;
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Finds callout blockquotes in the visible ranges. Returns the marker text
 * spans (for coloring/replacement) and the map of callout line numbers to
 * their type. Callouts are always decorated (even under the cursor) so they
 * keep their styled appearance while being edited.
 */
function collectCallouts(view: EditorView): {
  markers: { from: number; to: number; kind: string; active: boolean }[];
  lines: Map<number, string>;
} {
  const markers: { from: number; to: number; kind: string; active: boolean }[] = [];
  const lines = new Map<number, string>();
  const cursor = view.state.selection.main.head;
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Blockquote') return;
        const fromLine = view.state.doc.lineAt(node.from);
        const callout = matchCalloutLine(fromLine.text);
        if (!callout) return;
        const markerStart = fromLine.from + callout.start;
        const active = cursor >= node.from && cursor <= node.to;
        markers.push({
          from: markerStart,
          to: markerStart + callout.raw.length,
          kind: callout.kind,
          active,
        });
        const toLine = view.state.doc.lineAt(node.to);
        for (let i = fromLine.number; i <= toLine.number; i++) {
          lines.set(i, callout.kind);
        }
      },
    });
  }

  return { markers, lines };
}

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
  // Fenced code content resolves to CodeText (child of FencedCode); CodeBlock is
  // indented code, and InlineCode covers inline backtick spans.
  return (
    node.name === 'FencedCode' || node.name === 'CodeText' || node.name === 'CodeBlock' || node.name === 'InlineCode'
  );
}

function getTabDirectory(view: EditorView): string {
  const tabId = (view as AppEditorView)._currentTabId;
  if (!tabId) return '';
  const path = appContext.editor.tabs.find((t) => t.id === tabId)?.path;
  return path ? path.replace(/[\\/][^\\/]+$/, '') : '';
}

export const linkBoundaryClickHandler = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    if (event.button !== 0 || event.shiftKey) return false;
    const pos = view.posAndSideAtCoords({ x: event.clientX, y: event.clientY }, false);
    if (pos == null) return false;

    const doc = view.state.doc;
    const cursor = view.state.selection.main.head;
    const line = doc.lineAt(pos.pos);
    let target: number | null = null;

    syntaxTree(view.state).iterate({
      from: line.from,
      to: line.to,
      enter: (node) => {
        if (target != null || node.name !== 'Link') return;
        if (cursor > node.from && cursor < node.to) return;
        const urlNode = node.node.getChild('URL');
        if (!urlNode) return;
        const linkMarks = node.node.getChildren('LinkMark');
        const textEnd = linkMarks[1]?.from ?? urlNode.from;
        const after = doc.sliceString(urlNode.to, urlNode.to + 1);
        const hideEnd = after === ')' ? urlNode.to + 1 : urlNode.to;
        if (pos.pos >= textEnd && pos.pos < hideEnd) target = hideEnd;
      },
    });

    if (target == null) return false;
    event.preventDefault();
    view.focus();
    view.dispatch({ selection: { anchor: target }, scrollIntoView: false });
    return true;
  },
});

function findHiddenMarkers(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  ranges: Range<Decoration>[],
  tableSpans: Array<{ from: number; to: number }>,
) {
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

  const isInTable = (from: number, to: number) => tableSpans.some((span) => from >= span.from && to <= span.to);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const cfg = MARKER_CONFIG.find((c) => c.marker === node.name);
        if (!cfg) return;
        if (isInTable(node.from, node.to)) return;
        for (const p of hiddenParents) {
          if (node.from >= p.from && node.to <= p.to) {
            let deco: typeof formattingMaskDeco;
            if (cfg.marker === 'LinkMark') {
              deco = formattingMaskAutolinkDeco;
            } else {
              deco = formattingMaskDeco;
            }
            ranges.push(deco.range(node.from, node.to));
            if (HIDE_TRAILING_SPACE.has(cfg.marker)) {
              const after = view.state.doc.sliceString(node.to, node.to + 1);
              if (after === ' ') {
                ranges.push(deco.range(node.to, node.to + 1));
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
  const { markers: calloutMarkers, lines: calloutLines } = collectCallouts(view);

  if (!rendered) {
    const ranges: Range<Decoration>[] = [];
    for (const m of calloutMarkers) {
      ranges.push(Decoration.mark({ class: `cm-callout-marker cm-callout-${m.kind}` }).range(m.from, m.to));
    }
    for (const [lineNo, kind] of calloutLines) {
      ranges.push(Decoration.line({ class: `cm-callout cm-callout-${kind}` }).range(view.state.doc.line(lineNo).from));
    }
    return Decoration.set(ranges, true);
  }

  const tree = syntaxTree(view.state);
  const ranges: Range<Decoration>[] = [];
  const cursorHeadingLines = findCursorHeadingLines(view);
  const tableSpans = collectTableSpans(view.state, view.visibleRanges);

  for (const m of calloutMarkers) {
    if (m.active) {
      ranges.push(Decoration.mark({ class: `cm-callout-marker cm-callout-${m.kind}` }).range(m.from, m.to));
    } else {
      ranges.push(
        Decoration.replace({
          widget: new CalloutTitleWidget(m.kind, CALLOUT_STYLES[m.kind].title),
        }).range(m.from, m.to),
      );
    }
  }

  findHiddenMarkers(view, tree, ranges, tableSpans);

  const tableLines = new Set<number>();
  for (const span of tableSpans) {
    const fromLine = view.state.doc.lineAt(span.from).number;
    const toLine = view.state.doc.lineAt(Math.max(span.from, span.to - 1)).number;
    for (let i = fromLine; i <= toLine; i++) {
      tableLines.add(i);
    }
  }

  const codeBlockLines = new Set<number>();
  const frontmatterLines = new Set<number>();
  const parserHrs = new Set<number>();
  const blockquoteLines = new Set<number>();
  const cursor = view.state.selection.main.head;

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === 'Frontmatter') {
          const startLine = view.state.doc.lineAt(node.from).number;
          const endLine = view.state.doc.lineAt(node.to).number;
          for (let i = startLine; i <= endLine; i++) {
            frontmatterLines.add(i);
          }
          return false;
        }
        if (node.name === 'Table') {
          if (tableSpans.some((span) => node.from === span.from && node.to === span.to)) {
            return false;
          }
        }
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
          let p: typeof node.node | null = node.node.parent;
          while (p) {
            if (p.name === 'FencedCode') {
              if (!(cursor >= p.from && cursor <= p.to)) {
                ranges.push(codeInfoDeco.range(node.from, node.to));
              }
              break;
            }
            p = p.parent;
          }
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
        } else if (node.name === 'Image') {
          if (cursor >= node.from && cursor <= node.to) return;
          if (tableSpans.some((span) => node.from >= span.from && node.to <= span.to)) return false;
          const urlNode = node.node.getChild('URL');
          if (!urlNode) return;
          const linkMarks = node.node.getChildren('LinkMark');
          const altStart = linkMarks[0]?.to ?? node.from;
          const altEnd = linkMarks[1]?.from ?? urlNode.from;
          const alt = view.state.doc.sliceString(altStart, altEnd).trim();
          const rawSrc = view.state.doc.sliceString(urlNode.from, urlNode.to);
          const src = resolveImageSrc(rawSrc, getTabDirectory(view));
          ranges.push(imageWidgetDecoration(node.from, node.to, src, alt));
          return false;
        } else if (node.name === 'Link') {
          if (!(cursor >= node.from && cursor <= node.to)) {
            const linkMarks = node.node.getChildren('LinkMark');
            const urlNode = node.node.getChild('URL');
            if (urlNode) {
              for (const lm of linkMarks) {
                ranges.push(formattingMaskDeco.range(lm.from, lm.to));
              }
              const before = view.state.doc.sliceString(urlNode.from - 1, urlNode.from);
              const after = view.state.doc.sliceString(urlNode.to, urlNode.to + 1);
              const hideStart = before === '(' ? urlNode.from - 1 : urlNode.from;
              const hideEnd = after === ')' ? urlNode.to + 1 : urlNode.to;
              ranges.push(linkUrlMaskDeco.range(hideStart, hideEnd));
              const textMarks = linkMarks.filter((lm) => lm.from < urlNode.from);
              if (textMarks.length >= 2) {
                const textStart = textMarks[0].to;
                const textEnd = textMarks[textMarks.length - 1].from;
                if (textStart < textEnd) {
                  ranges.push(linkTextDeco.range(textStart, textEnd));
                }
              }
            }
          }
        }
      },
    });
  }

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);

      if (tableLines.has(line.number)) {
        pos = line.to + 1;
        continue;
      }

      if (frontmatterLines.has(line.number)) {
        ranges.push(Decoration.line({ class: 'cm-frontmatter' }).range(line.from));
        pos = line.to + 1;
        continue;
      }

      if (codeBlockLines.has(line.number)) {
        ranges.push(codeBlockLineDeco.range(line.from));
      }

      if (cursorHeadingLines.has(line.number)) {
        ranges.push(headingRawDeco.range(line.from, line.to));
      }

      const bqMatch = bqMatchRe.exec(line.text);
      if (bqMatch) {
        if (!calloutLines.has(line.number)) {
          ranges.push(blockquoteBgDeco.range(line.from));
        }
        if (blockquoteLines.has(line.number)) {
          ranges.push(blockquoteQuoteDeco.range(line.from));
        }
      }

      const calloutKind = calloutLines.get(line.number);
      if (calloutKind) {
        ranges.push(Decoration.line({ class: `cm-callout cm-callout-${calloutKind}` }).range(line.from));
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

      if (!isVisibleInCodeBlock(tree, line.from) && (parserHrs.has(line.from) || line.text.trim() === '---')) {
        const onLine = cursor >= line.from && cursor <= line.to;
        ranges.push((onLine ? horizontalRuleDeco : horizontalRuleMaskedDeco).range(line.from, line.to));
      }

      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

export function createMarkdownDecorationsPlugin(rendered: boolean): Extension[] {
  return [
    ViewPlugin.fromClass(
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
    ),
    linkTextTheme,
    ...(rendered
      ? [createTableWidgetField(), tableWidgetClickHandler, imageWidgetClickHandler, linkBoundaryClickHandler]
      : []),
  ];
}

export const codeBlockCopyHandler = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('cm-code-info')) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const tree = syntaxTree(view.state);
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, 1);
    while (node && node.name !== 'FencedCode') {
      node = node.parent;
    }
    if (!node) return false;

    const fencedNode = node;

    const doc = view.state.doc;
    const startLine = doc.lineAt(fencedNode.from);
    const endLine = doc.lineAt(fencedNode.to);

    let codeEnd = fencedNode.to;
    if (endLine.number > startLine.number && /^```\s*$/.test(endLine.text)) {
      codeEnd = endLine.from;
    }

    const code = doc.sliceString(startLine.to + 1, codeEnd);
    navigator.clipboard.writeText(code).then(() => showToast('success', translate('preview.codeCopied')));

    return true;
  },
});
