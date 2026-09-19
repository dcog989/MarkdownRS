import { syntaxTree } from "@codemirror/language";
import type { Extension, Line, Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import {
  collectCalloutDecorations,
  collectCalloutLine,
  collectCallouts,
  collectRawCalloutDecorations,
} from "./markdownCallout";
import { renderedCopyHandler } from "./markdownCopy";
import {
  type CalloutInfo,
  type DecorationWalk,
  type GetTabDirectory,
  isHrLineRevealed,
  isRevealed,
  isVisibleInCodeBlock,
} from "./markdownDecorationCore";
import { imageWidgetDecoration, imageWidgetPointer } from "./markdownImageWidget";
import { renderedModeKeymap } from "./markdownListKeymap";
import { maskedLinkPointer, wrapBoundaryPointer } from "./markdownPointerResolvers";
import { collectTableSpans, createTableWidgetField, tableWidgetPointer } from "./markdownTableWidget";
import { renderedPointerHandler } from "./renderedPointer";
import { resolveImageSrc } from "./resolveImagePath";

const HEADING_NODE_NAMES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
]);

const MARKER_CONFIG: Array<{ marker: string; parents: ReadonlySet<string> }> = [
  { marker: "EmphasisMark", parents: new Set(["Emphasis", "StrongEmphasis"]) },
  {
    marker: "HeaderMark",
    parents: new Set(["ATXHeading1", "ATXHeading2", "ATXHeading3", "ATXHeading4", "ATXHeading5", "ATXHeading6"]),
  },
  { marker: "LinkMark", parents: new Set(["Autolink"]) },
  { marker: "QuoteMark", parents: new Set(["Blockquote"]) },
  { marker: "CodeMark", parents: new Set(["InlineCode", "FencedCode"]) },
];

const HIDE_TRAILING_SPACE = new Set(["HeaderMark", "QuoteMark"]);

const strikethroughDeco = Decoration.mark({ class: "cm-strikethrough" });
const blockquoteQuoteDeco = Decoration.line({ class: "cm-blockquote-quote" });
const blockquoteBgDeco = Decoration.line({ class: "cm-blockquote-bg" });
const codeBlockLineDeco = Decoration.line({ class: "cm-code-block" });
const inlineCodeDeco = Decoration.mark({ class: "cm-code" });
const codeInfoDeco = Decoration.mark({ class: "cm-code-info" });
const horizontalRuleDeco = Decoration.mark({ class: "cm-hr cm-hr-raw" });
const horizontalRuleMaskedDeco = Decoration.mark({ class: "cm-hr cm-hr-mask" });
const bulletPointDeco = Decoration.replace({
  widget: new (class extends WidgetType {
    toDOM() {
      const span = document.createElement("span");
      span.className = "cm-bullet-widget";
      span.textContent = "\u2022";
      return span;
    }
  })(),
});
const headingRawDeco = Decoration.mark({ class: "cm-heading-raw" });
const formattingMaskDeco = Decoration.replace({});
const formattingMaskAutolinkDeco = Decoration.replace({ inclusive: true });
// Inclusive so clicks at the end of a hidden URL range map past it instead of
// jumping to the start (e.g. before '(') — same fix as the autolink brackets.
const linkUrlMaskDeco = Decoration.replace({ inclusive: true });
const linkTextDeco = Decoration.mark({ class: "cm-link-text" });
const linkTextTheme = EditorView.baseTheme({
  ".cm-link-text": {
    color: "var(--editor-link)",
    textDecoration: "underline",
  },
  "&.cm-modifier-down .cm-link-text": {
    cursor: "pointer",
  },
});

const bqMatchRe = /^\s*> ?/;
const bulletMatchRe = /^(\s*)-\s/;
const stRegex = /~~([^~]+)~~/g;

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
        if (cfg.marker === "LinkMark") {
          deco = formattingMaskAutolinkDeco;
        } else {
          deco = formattingMaskDeco;
        }
        ranges.push(deco.range(node.from, node.to));
        if (HIDE_TRAILING_SPACE.has(cfg.marker)) {
          const after = view.state.doc.sliceString(node.to, node.to + 1);
          if (after === " ") {
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

function collectFrontmatterLines(walk: DecorationWalk, node: SyntaxNodeRef): void {
  const doc = walk.view.state.doc;
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;
  for (let i = startLine; i <= endLine; i++) {
    walk.frontmatterLines.add(i);
  }
}

/** Widget-rendered tables are skipped so their children aren't decorated. */
function shouldSkipTable(walk: DecorationWalk, node: SyntaxNodeRef): boolean {
  return walk.tableSpans.some((span) => node.from === span.from && node.to === span.to);
}

function collectCodeBlockLines(walk: DecorationWalk, node: SyntaxNodeRef, rangeFrom: number, rangeTo: number): void {
  const start = Math.max(node.from, rangeFrom);
  const end = Math.min(node.to, rangeTo);
  const fromLine = walk.view.state.doc.lineAt(start);
  const toLine = walk.view.state.doc.lineAt(end);
  for (let i = fromLine.number; i <= toLine.number; i++) {
    walk.codeBlockLines.add(i);
  }
}

function collectCodeInfo(walk: DecorationWalk, node: SyntaxNodeRef): void {
  let p: typeof node.node | null = node.node.parent;
  while (p) {
    if (p.name === "FencedCode") {
      if (!isRevealed(walk.view, p.from, p.to)) {
        walk.ranges.push(codeInfoDeco.range(node.from, node.to));
      }
      break;
    }
    p = p.parent;
  }
}

function collectBlockquoteLines(walk: DecorationWalk, node: SyntaxNodeRef): void {
  if (isRevealed(walk.view, node.from, node.to)) return;
  const fromLine = walk.view.state.doc.lineAt(node.from);
  const toLine = walk.view.state.doc.lineAt(node.to);
  for (let i = fromLine.number; i <= toLine.number; i++) {
    walk.blockquoteLines.add(i);
  }
}

/** Returns true when the node's subtree should be skipped. */
function collectImageWidget(walk: DecorationWalk, node: SyntaxNodeRef): boolean {
  if (isRevealed(walk.view, node.from, node.to)) return false;
  if (walk.tableSpans.some((span) => node.from >= span.from && node.to <= span.to)) return true;
  const urlNode = node.node.getChild("URL");
  if (!urlNode) return false;
  const linkMarks = node.node.getChildren("LinkMark");
  const altStart = linkMarks[0]?.to ?? node.from;
  const altEnd = linkMarks[1]?.from ?? urlNode.from;
  const alt = walk.view.state.doc.sliceString(altStart, altEnd).trim();
  const rawSrc = walk.view.state.doc.sliceString(urlNode.from, urlNode.to);
  const src = resolveImageSrc(rawSrc, walk.getTabDirectory(walk.view));
  walk.ranges.push(imageWidgetDecoration(node.from, node.to, src, alt));
  return true;
}

function collectLinkMasks(walk: DecorationWalk, node: SyntaxNodeRef): void {
  if (isRevealed(walk.view, node.from, node.to)) return;
  const linkMarks = node.node.getChildren("LinkMark");
  const urlNode = node.node.getChild("URL");
  if (!urlNode) return;
  for (const lm of linkMarks) {
    walk.ranges.push(formattingMaskDeco.range(lm.from, lm.to));
  }
  const before = walk.view.state.doc.sliceString(urlNode.from - 1, urlNode.from);
  const after = walk.view.state.doc.sliceString(urlNode.to, urlNode.to + 1);
  const hideStart = before === "(" ? urlNode.from - 1 : urlNode.from;
  const hideEnd = after === ")" ? urlNode.to + 1 : urlNode.to;
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
function visitDecorationNode(walk: DecorationWalk, node: SyntaxNodeRef, rangeFrom: number, rangeTo: number): boolean {
  switch (node.name) {
    case "Frontmatter":
      collectFrontmatterLines(walk, node);
      return true;
    case "Table":
      return shouldSkipTable(walk, node);
    case "FencedCode":
      collectCodeBlockLines(walk, node, rangeFrom, rangeTo);
      return false;
    case "InlineCode":
      walk.ranges.push(inlineCodeDeco.range(node.from, node.to));
      return false;
    case "CodeInfo":
      collectCodeInfo(walk, node);
      return false;
    case "HorizontalRule":
      walk.parserHrs.add(node.from);
      return false;
    case "Blockquote":
      collectBlockquoteLines(walk, node);
      return false;
    case "Image":
      return collectImageWidget(walk, node);
    case "Link":
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

/** Paints per-line decorations; table, frontmatter, and code-block lines skip the WYSIWYG decorators. */
function visitDecorationLine(walk: DecorationWalk, line: Line): void {
  if (walk.tableLines.has(line.number)) return;
  if (walk.frontmatterLines.has(line.number)) {
    walk.ranges.push(Decoration.line({ class: "cm-frontmatter" }).range(line.from));
    return;
  }
  if (walk.codeBlockLines.has(line.number)) {
    walk.ranges.push(codeBlockLineDeco.range(line.from));
    return;
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
  if (!walk.parserHrs.has(line.from) && line.text.trim() !== "---") return;
  const onLine = isHrLineRevealed(walk.view, line.from, line.to);
  walk.ranges.push((onLine ? horizontalRuleDeco : horizontalRuleMaskedDeco).range(line.from, line.to));
}

/** Raw mode shows the literal `---`, so the rule is always painted un-masked. */
function collectRawHorizontalRule(walk: DecorationWalk, line: Line): void {
  if (isVisibleInCodeBlock(walk.tree, line.from)) return;
  if (!walk.parserHrs.has(line.from) && line.text.trim() !== "---") return;
  walk.ranges.push(horizontalRuleDeco.range(line.from, line.to));
}

/**
 * Raw mode paints the bare minimum of block structure — callout accents, code
 * block line backgrounds, and horizontal rules — so source stays recognizable
 * while remaining fully literal and WYSIWYG-free. Inline constructs rely on
 * syntax highlighting alone.
 */
function buildRawDecorations(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
  callouts: CalloutInfo,
  ranges: Range<Decoration>[],
): void {
  collectRawCalloutDecorations(view, callouts, ranges);

  const walk: DecorationWalk = {
    view,
    tree,
    ranges,
    getTabDirectory: () => "",
    calloutMarkers: callouts.markers,
    calloutLines: callouts.lines,
    tableSpans: [],
    cursorHeadingLines: new Set<number>(),
    tableLines: new Set<number>(),
    frontmatterLines: new Set<number>(),
    codeBlockLines: new Set<number>(),
    parserHrs: new Set<number>(),
    blockquoteLines: new Set<number>(),
  };

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        switch (node.name) {
          case "Frontmatter":
            collectFrontmatterLines(walk, node);
            return true;
          case "FencedCode":
            collectCodeBlockLines(walk, node, from, to);
            return true;
          case "HorizontalRule":
            walk.parserHrs.add(node.from);
            return false;
        }
      },
    });
  }

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      if (walk.frontmatterLines.has(line.number)) {
        pos = line.to + 1;
        continue;
      }
      if (walk.codeBlockLines.has(line.number)) {
        walk.ranges.push(codeBlockLineDeco.range(line.from));
        pos = line.to + 1;
        continue;
      }
      collectRawHorizontalRule(walk, line);
      pos = line.to + 1;
    }
  }
}

/**
 * Single-pass decoration builder: one syntax-tree walk collects block-level
 * spans and inline widgets, one line walk paints line/word decorations. Each
 * construct lives in its own collector so the passes stay readable without
 * splitting into repeated per-construct tree walks.
 */
function buildDecorations(view: EditorView, rendered: boolean, getTabDirectory: GetTabDirectory): DecorationSet {
  const callouts = collectCallouts(view);
  const ranges: Range<Decoration>[] = [];

  if (!rendered) {
    buildRawDecorations(view, syntaxTree(view.state), callouts, ranges);
    return Decoration.set(ranges, true);
  }

  const tree = syntaxTree(view.state);
  const walk: DecorationWalk = {
    view,
    tree,
    ranges,
    getTabDirectory,
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

export function createMarkdownDecorationsPlugin(rendered: boolean, getTabDirectory: GetTabDirectory): Extension[] {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = buildDecorations(view, rendered, getTabDirectory);
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
            this.decorations = buildDecorations(update.view, rendered, getTabDirectory);
          }
        }
      },
      { decorations: (v) => v.decorations },
    ),
    linkTextTheme,
    ...(rendered
      ? [
          createTableWidgetField(),
          renderedPointerHandler([tableWidgetPointer, imageWidgetPointer, maskedLinkPointer, wrapBoundaryPointer]),
          renderedCopyHandler,
          renderedModeKeymap,
        ]
      : []),
  ];
}

export { matchCalloutLine } from "./markdownCallout";
export type { CodeBlockCopyDeps } from "./markdownCopy";
export { createCodeBlockCopyHandler, snapToMarkdownConstruct } from "./markdownCopy";
export type { GetTabDirectory };
export { renderedCopyHandler };
