import { type SyntaxNode, syntaxTree } from '@codemirror/language';
import { type Extension, type Line, Prec, type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
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
interface CalloutInfo {
  markers: { from: number; to: number; kind: string; active: boolean }[];
  lines: Map<number, string>;
}

function collectCallouts(view: EditorView): CalloutInfo {
  const markers: { from: number; to: number; kind: string; active: boolean }[] = [];
  const lines = new Map<number, string>();
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
        const active = isRevealed(view, node.from, node.to);
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
  const tree = syntaxTree(view.state);
  for (const range of view.state.selection.ranges) {
    const node = tree.resolveInner(range.from, -1);
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
  }
  return headings;
}

/**
 * Reveals (paints raw) a node when the caret sits inside it, at either edge, or
 * when any selection range overlaps it. Range overlap keeps a node unpainted
 * while the user drags a selection through it or edits with multiple carets.
 * Including both edges means the raw markers stay visible the moment the caret
 * stops right before or right after a construct (e.g. `*Italics*`), matching
 * WYSIWYG editing expectations.
 */
function isRevealed(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((r) => {
    if (r.from !== r.to) return r.from < to && r.to > from;
    const caret = r.from;
    return caret >= from && caret <= to;
  });
}

/**
 * Horizontal rules are their own line, so any caret on the line (edges
 * included) keeps the rule visible as raw text instead of flipping it under
 * the caret. Uses the node's block span, not a nested inline construct.
 */
function isHrLineRevealed(view: EditorView, lineFrom: number, lineTo: number): boolean {
  return view.state.selection.ranges.some((r) =>
    r.from === r.to ? r.from >= lineFrom && r.from <= lineTo : r.from < lineTo && r.to > lineFrom,
  );
}

/**
 * In rendered mode, Backspace on an empty list line (e.g. the `- ` item
 * auto-created by Enter) should reveal the raw marker on the first press and
 * remove it on the second, instead of lang-markdown's default of blanking the
 * whole marker into invisible spaces on the first press.
 */
function listMarkerBackspace(view: EditorView): boolean {
  const { state } = view;
  const { head, empty } = state.selection.main;
  if (!empty || head === 0) return false;
  const line = state.doc.lineAt(head);
  if (head !== line.to) return false;

  const match = /^(\s*)-\s?$/.exec(line.text);
  if (!match) return false;

  const dashStart = line.from + match[1].length;
  const dashEnd = dashStart + 1;
  const hasTrailingSpace = dashEnd < line.to;

  view.dispatch({
    changes: hasTrailingSpace ? { from: dashEnd, to: line.to } : { from: dashStart, to: dashEnd },
    selection: { anchor: hasTrailingSpace ? dashEnd : dashStart },
  });
  return true;
}

const renderedModeKeymap = Prec.highest(keymap.of([{ key: 'Backspace', run: listMarkerBackspace }]));

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

const COPY_SNAP_NODES = new Set(['Emphasis', 'StrongEmphasis', 'Link', 'Image', 'InlineCode']);

/**
 * Expands a selection to cover any inline Markdown construct it partially
 * touches, so copying always yields the full raw source (e.g. `**bold**`
 * instead of `bold` or a half-marker fragment) regardless of how the painted
 * selection edges align with the underlying document.
 */
export function snapToMarkdownConstruct(view: EditorView, from: number, to: number): { from: number; to: number } {
  let snapFrom = from;
  let snapTo = to;
  syntaxTree(view.state).iterate({
    from,
    to,
    enter: (node) => {
      if (!COPY_SNAP_NODES.has(node.name)) return;
      if (node.from < from || node.to > to) {
        snapFrom = Math.min(snapFrom, node.from);
        snapTo = Math.max(snapTo, node.to);
      }
    },
  });
  return { from: snapFrom, to: snapTo };
}

export const renderedCopyHandler = EditorView.domEventHandlers({
  copy: (event, view) => {
    const selection = view.state.selection.main;
    if (selection.empty) return false;
    const { from, to } = snapToMarkdownConstruct(view, selection.from, selection.to);
    event.preventDefault();
    navigator.clipboard.writeText(view.state.sliceDoc(from, to));
    return true;
  },
});

interface PendingMaskedClick {
  target: number;
  x: number;
  y: number;
}

const pendingMaskedClick = new WeakMap<EditorView, PendingMaskedClick>();

/**
 * Returns the caret position a click on a masked link should land at, or null
 * when the click is not on a masked URL region.
 */
function maskedLinkClickTarget(view: EditorView, pos: number): number | null {
  const doc = view.state.doc;
  const cursor = view.state.selection.main.head;
  const line = doc.lineAt(pos);
  let target: number | null = null;

  syntaxTree(view.state).iterate({
    from: line.from,
    to: line.to,
    enter: (node) => {
      if (target != null) return;
      if (node.name === 'Autolink') {
        if (cursor > node.from && cursor < node.to) return;
        const linkMarks = node.node.getChildren('LinkMark');
        const maskStart = linkMarks[linkMarks.length - 1]?.from ?? node.to;
        if (pos >= maskStart && pos <= node.to) target = node.to;
        return;
      }
      if (node.name !== 'Link') return;
      const urlNode = node.node.getChild('URL');
      if (!urlNode) return;
      if (cursor > node.from && cursor < node.to) return;
      const linkMarks = node.node.getChildren('LinkMark');
      const textEnd = linkMarks[1]?.from ?? urlNode.from;
      const after = doc.sliceString(urlNode.to, urlNode.to + 1);
      const hideEnd = after === ')' ? urlNode.to + 1 : urlNode.to;
      if (pos >= textEnd && pos < hideEnd) target = hideEnd;
    },
  });

  return target;
}

/**
 * Clicking a masked URL region should place the caret at a sensible spot, but
 * must not swallow mousedown so that drag-selections starting on the URL (e.g.
 * an autolink closing a line) still work. So mousedown only remembers the
 * intended caret; a plain click (no drag, no range produced) applies it on
 * mouseup, letting the core mouse-selection drive any real drag in between.
 */
export const linkBoundaryClickHandler = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    pendingMaskedClick.delete(view);
    if (event.button !== 0 || event.shiftKey) return false;
    const pos = view.posAndSideAtCoords({ x: event.clientX, y: event.clientY }, false);
    if (pos == null) return false;
    const target = maskedLinkClickTarget(view, pos.pos);
    if (target == null) return false;
    pendingMaskedClick.set(view, { target, x: event.clientX, y: event.clientY });
    return false;
  },
  mouseup: (event, view) => {
    const pending = pendingMaskedClick.get(view);
    if (!pending) return false;
    pendingMaskedClick.delete(view);
    if (!view.state.selection.main.empty) return false;
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 10) return false;
    view.dispatch({ selection: { anchor: pending.target }, scrollIntoView: false });
    return true;
  },
});

function findHiddenMarkers(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  ranges: Range<Decoration>[],
  tableSpans: Array<{ from: number; to: number }>,
) {
  const usedParents = new Set<string>();
  const markerCfg = new Map<string, { marker: string; parents: ReadonlySet<string> }>();

  for (const cfg of MARKER_CONFIG) {
    for (const p of cfg.parents) usedParents.add(p);
    markerCfg.set(cfg.marker, cfg);
  }

  const hiddenStack: Array<{ from: number; to: number }> = [];
  const isInTable = (from: number, to: number) => tableSpans.some((span) => from >= span.from && to <= span.to);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (usedParents.has(node.name)) {
          if (isRevealed(view, node.from, node.to)) return false;
          hiddenStack.push({ from: node.from, to: node.to });
          return;
        }
        if (hiddenStack.length === 0) return;
        const cfg = markerCfg.get(node.name);
        if (!cfg) return;
        const parent = hiddenStack[hiddenStack.length - 1];
        if (node.from < parent.from || node.to > parent.to) return;
        if (isInTable(node.from, node.to)) return;
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
      },
      leave: (node) => {
        if (usedParents.has(node.name) && hiddenStack.length > 0) {
          const top = hiddenStack[hiddenStack.length - 1];
          if (top.from === node.from && top.to === node.to) {
            hiddenStack.pop();
          }
        }
      },
    });
  }
}

/**
 * Shared state threaded through the single decoration pass. Each per-construct
 * collector reads/writes only its own slice, keeping buildDecorations a thin
 * orchestrator over one tree walk and one line walk.
 */
interface DecorationWalk {
  view: EditorView;
  tree: ReturnType<typeof syntaxTree>;
  ranges: Range<Decoration>[];
  calloutMarkers: CalloutInfo['markers'];
  calloutLines: CalloutInfo['lines'];
  tableSpans: Array<{ from: number; to: number }>;
  cursorHeadingLines: Set<number>;
  tableLines: Set<number>;
  frontmatterLines: Set<number>;
  codeBlockLines: Set<number>;
  parserHrs: Set<number>;
  blockquoteLines: Set<number>;
}

function collectFrontmatterLines(walk: DecorationWalk, node: SyntaxNode): void {
  const doc = walk.view.state.doc;
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;
  for (let i = startLine; i <= endLine; i++) {
    walk.frontmatterLines.add(i);
  }
}

/** Widget-rendered tables are skipped so their children aren't decorated. */
function shouldSkipTable(walk: DecorationWalk, node: SyntaxNode): boolean {
  return walk.tableSpans.some((span) => node.from === span.from && node.to === span.to);
}

function collectCodeBlockLines(walk: DecorationWalk, node: SyntaxNode, rangeFrom: number, rangeTo: number): void {
  const start = Math.max(node.from, rangeFrom);
  const end = Math.min(node.to, rangeTo);
  const fromLine = walk.view.state.doc.lineAt(start);
  const toLine = walk.view.state.doc.lineAt(end);
  for (let i = fromLine.number; i <= toLine.number; i++) {
    walk.codeBlockLines.add(i);
  }
}

function collectCodeInfo(walk: DecorationWalk, node: SyntaxNode): void {
  let p: typeof node.node | null = node.node.parent;
  while (p) {
    if (p.name === 'FencedCode') {
      if (!isRevealed(walk.view, p.from, p.to)) {
        walk.ranges.push(codeInfoDeco.range(node.from, node.to));
      }
      break;
    }
    p = p.parent;
  }
}

function collectBlockquoteLines(walk: DecorationWalk, node: SyntaxNode): void {
  if (isRevealed(walk.view, node.from, node.to)) return;
  const fromLine = walk.view.state.doc.lineAt(node.from);
  const toLine = walk.view.state.doc.lineAt(node.to);
  for (let i = fromLine.number; i <= toLine.number; i++) {
    walk.blockquoteLines.add(i);
  }
}

/** Returns true when the node's subtree should be skipped. */
function collectImageWidget(walk: DecorationWalk, node: SyntaxNode): boolean {
  if (isRevealed(walk.view, node.from, node.to)) return false;
  if (walk.tableSpans.some((span) => node.from >= span.from && node.to <= span.to)) return true;
  const urlNode = node.node.getChild('URL');
  if (!urlNode) return false;
  const linkMarks = node.node.getChildren('LinkMark');
  const altStart = linkMarks[0]?.to ?? node.from;
  const altEnd = linkMarks[1]?.from ?? urlNode.from;
  const alt = walk.view.state.doc.sliceString(altStart, altEnd).trim();
  const rawSrc = walk.view.state.doc.sliceString(urlNode.from, urlNode.to);
  const src = resolveImageSrc(rawSrc, getTabDirectory(walk.view));
  walk.ranges.push(imageWidgetDecoration(node.from, node.to, src, alt));
  return true;
}

function collectLinkMasks(walk: DecorationWalk, node: SyntaxNode): void {
  if (isRevealed(walk.view, node.from, node.to)) return;
  const linkMarks = node.node.getChildren('LinkMark');
  const urlNode = node.node.getChild('URL');
  if (!urlNode) return;
  for (const lm of linkMarks) {
    walk.ranges.push(formattingMaskDeco.range(lm.from, lm.to));
  }
  const before = walk.view.state.doc.sliceString(urlNode.from - 1, urlNode.from);
  const after = walk.view.state.doc.sliceString(urlNode.to, urlNode.to + 1);
  const hideStart = before === '(' ? urlNode.from - 1 : urlNode.from;
  const hideEnd = after === ')' ? urlNode.to + 1 : urlNode.to;
  walk.ranges.push(linkUrlMaskDeco.range(hideStart, hideEnd));
  const textMarks = linkMarks.filter((lm) => lm.from < urlNode.from);
  if (textMarks.length >= 2) {
    const textStart = textMarks[0].to;
    const textEnd = textMarks[textMarks.length - 1].from;
    if (textStart < textEnd) {
      walk.ranges.push(linkTextDeco.range(textStart, textEnd));
    }
  }
}

/** Per-construct node dispatch; returns true when the subtree should be skipped. */
function visitDecorationNode(walk: DecorationWalk, node: SyntaxNode, rangeFrom: number, rangeTo: number): boolean {
  switch (node.name) {
    case 'Frontmatter':
      collectFrontmatterLines(walk, node);
      return true;
    case 'Table':
      return shouldSkipTable(walk, node);
    case 'FencedCode':
      collectCodeBlockLines(walk, node, rangeFrom, rangeTo);
      return false;
    case 'InlineCode':
      walk.ranges.push(inlineCodeDeco.range(node.from, node.to));
      return false;
    case 'CodeInfo':
      collectCodeInfo(walk, node);
      return false;
    case 'HorizontalRule':
      walk.parserHrs.add(node.from);
      return false;
    case 'Blockquote':
      collectBlockquoteLines(walk, node);
      return false;
    case 'Image':
      return collectImageWidget(walk, node);
    case 'Link':
      collectLinkMasks(walk, node);
      return false;
    default:
      return false;
  }
}

function collectTableLines(walk: DecorationWalk): void {
  for (const span of walk.tableSpans) {
    const fromLine = walk.view.state.doc.lineAt(span.from).number;
    const toLine = walk.view.state.doc.lineAt(Math.max(span.from, span.to - 1)).number;
    for (let i = fromLine; i <= toLine; i++) {
      walk.tableLines.add(i);
    }
  }
}

/** Paints per-line decorations; table and frontmatter lines are fully skipped. */
function visitDecorationLine(walk: DecorationWalk, line: Line): void {
  if (walk.tableLines.has(line.number)) return;
  if (walk.frontmatterLines.has(line.number)) {
    walk.ranges.push(Decoration.line({ class: 'cm-frontmatter' }).range(line.from));
    return;
  }
  if (walk.codeBlockLines.has(line.number)) {
    walk.ranges.push(codeBlockLineDeco.range(line.from));
  }
  if (walk.cursorHeadingLines.has(line.number)) {
    walk.ranges.push(headingRawDeco.range(line.from, line.to));
  }
  collectBlockquoteLine(walk, line);
  collectCalloutLine(walk, line);
  collectBulletPoint(walk, line);
  collectStrikethrough(walk, line);
  collectHorizontalRule(walk, line);
}

function collectBlockquoteLine(walk: DecorationWalk, line: Line): void {
  const bqMatch = bqMatchRe.exec(line.text);
  if (!bqMatch) return;
  if (!walk.calloutLines.has(line.number)) {
    walk.ranges.push(blockquoteBgDeco.range(line.from));
  }
  if (walk.blockquoteLines.has(line.number)) {
    walk.ranges.push(blockquoteQuoteDeco.range(line.from));
  }
}

function collectCalloutLine(walk: DecorationWalk, line: Line): void {
  const calloutKind = walk.calloutLines.get(line.number);
  if (calloutKind) {
    walk.ranges.push(Decoration.line({ class: `cm-callout cm-callout-${calloutKind}` }).range(line.from));
  }
}

function collectBulletPoint(walk: DecorationWalk, line: Line): void {
  const bulletMatch = bulletMatchRe.exec(line.text);
  if (!bulletMatch) return;
  const dashStart = line.from + bulletMatch[1].length;
  if (isHrLineRevealed(walk.view, dashStart, dashStart + 1)) return;
  walk.ranges.push(bulletPointDeco.range(dashStart, dashStart + 1));
}

function collectStrikethrough(walk: DecorationWalk, line: Line): void {
  stRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (true) {
    match = stRegex.exec(line.text);
    if (match === null) break;
    const start = line.from + match.index;
    const end = start + match[0].length;
    if (isVisibleInCodeBlock(walk.tree, start)) continue;
    walk.ranges.push(strikethroughDeco.range(start, end));
    if (!isRevealed(walk.view, start, end)) {
      walk.ranges.push(formattingMaskDeco.range(start, start + 2));
      walk.ranges.push(formattingMaskDeco.range(end - 2, end));
    }
  }
}

function collectHorizontalRule(walk: DecorationWalk, line: Line): void {
  if (isVisibleInCodeBlock(walk.tree, line.from)) return;
  if (!walk.parserHrs.has(line.from) && line.text.trim() !== '---') return;
  const onLine = isHrLineRevealed(walk.view, line.from, line.to);
  walk.ranges.push((onLine ? horizontalRuleDeco : horizontalRuleMaskedDeco).range(line.from, line.to));
}

function collectCalloutDecorations(walk: DecorationWalk): void {
  for (const m of walk.calloutMarkers) {
    if (m.active) {
      walk.ranges.push(Decoration.mark({ class: `cm-callout-marker cm-callout-${m.kind}` }).range(m.from, m.to));
    } else {
      walk.ranges.push(
        Decoration.replace({ widget: new CalloutTitleWidget(m.kind, CALLOUT_STYLES[m.kind].title) }).range(
          m.from,
          m.to,
        ),
      );
    }
  }
}

function collectRawCalloutDecorations(view: EditorView, callouts: CalloutInfo, ranges: Range<Decoration>[]): void {
  for (const m of callouts.markers) {
    ranges.push(Decoration.mark({ class: `cm-callout-marker cm-callout-${m.kind}` }).range(m.from, m.to));
  }
  for (const [lineNo, kind] of callouts.lines) {
    ranges.push(Decoration.line({ class: `cm-callout cm-callout-${kind}` }).range(view.state.doc.line(lineNo).from));
  }
}

/**
 * Single-pass decoration builder: one syntax-tree walk collects block-level
 * spans and inline widgets, one line walk paints line/word decorations. Each
 * construct lives in its own collector so the passes stay readable without
 * splitting into repeated per-construct tree walks.
 */
function buildDecorations(view: EditorView, rendered: boolean): DecorationSet {
  const callouts = collectCallouts(view);
  const ranges: Range<Decoration>[] = [];

  if (!rendered) {
    collectRawCalloutDecorations(view, callouts, ranges);
    return Decoration.set(ranges, true);
  }

  const tree = syntaxTree(view.state);
  const walk: DecorationWalk = {
    view,
    tree,
    ranges,
    calloutMarkers: callouts.markers,
    calloutLines: callouts.lines,
    tableSpans: collectTableSpans(view.state, view.visibleRanges),
    cursorHeadingLines: findCursorHeadingLines(view),
    tableLines: new Set<number>(),
    frontmatterLines: new Set<number>(),
    codeBlockLines: new Set<number>(),
    parserHrs: new Set<number>(),
    blockquoteLines: new Set<number>(),
  };

  collectCalloutDecorations(walk);
  findHiddenMarkers(view, tree, ranges, walk.tableSpans);
  collectTableLines(walk);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (visitDecorationNode(walk, node, from, to)) return false;
      },
    });
  }

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      visitDecorationLine(walk, line);
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
          if (
            update.docChanged ||
            update.viewportChanged ||
            update.selectionSet ||
            // The background parser grows the tree asynchronously via
            // Language.setState (no doc/viewport/selection change); rebuild so
            // constructs beyond the initially-parsed region (e.g. deep tables,
            // headings, callouts) paint right after a tab switch or scroll.
            syntaxTree(update.startState) !== syntaxTree(update.state)
          ) {
            this.decorations = buildDecorations(update.view, rendered);
          }
        }
      },
      { decorations: (v) => v.decorations },
    ),
    linkTextTheme,
    ...(rendered
      ? [
          createTableWidgetField(),
          tableWidgetClickHandler,
          imageWidgetClickHandler,
          linkBoundaryClickHandler,
          renderedCopyHandler,
          renderedModeKeymap,
        ]
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

    const code = doc.sliceString(startLine.to + 1, codeEnd).replace(/\n$/, '');
    navigator.clipboard.writeText(code).then(() => showToast('success', translate('preview.codeCopied')));

    return true;
  },
});
