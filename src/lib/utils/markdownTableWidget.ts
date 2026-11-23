import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import { type EditorState, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { escapeHtml } from "$lib/utils/dom";
import { decodeHref } from "$lib/utils/fileDialogs";
import { navigateToPath } from "$lib/utils/fileSystem";
import { jumpToAnchor } from "$lib/utils/outline";
import type { GetTabDirectory } from "./markdownDecorationCore";
import { registerWidgetOffset, textOffsetAt } from "./renderedPointer";
import { resolveImageSrc } from "./resolveImagePath";

export type TableAlignment = "left" | "center" | "right" | "none";

const BLOCKQUOTE_PREFIX = /^\s*>+\s?/;
const ALIGN_CENTER = /^:.*:$/;
const ALIGN_RIGHT = /^:?.*:$/;
const ALIGN_LEFT = /^:.*$/;

export function splitRow(row: string): string[] {
  return splitRowWithOffsets(row).map((cell) => cell.value);
}

interface TableCellSpan {
  value: string;
  /** Offset of the trimmed cell content within the row string. */
  start: number;
}

function splitRowWithOffsets(row: string): TableCellSpan[] {
  const cells: TableCellSpan[] = [];
  let current = "";
  let currentStart = 0;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === "\\" && row[i + 1] === "|") {
      current += "|";
      i += 1;
      continue;
    }
    if (ch === "|") {
      cells.push({ value: current, start: currentStart });
      current = "";
      currentStart = i + 1;
      continue;
    }
    current += ch;
  }
  cells.push({ value: current, start: currentStart });
  if (cells.length > 0 && cells[0].value.trim() === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].value.trim() === "") cells.pop();
  return cells.map(({ value, start }) => {
    const trimmed = value.trim();
    return { value: trimmed, start: start + value.indexOf(trimmed) };
  });
}

export function parseAlignment(delimiter: string): TableAlignment[] {
  return splitRow(delimiter).map((cell) => {
    const c = cell.trim();
    if (ALIGN_CENTER.test(c)) return "center";
    if (ALIGN_RIGHT.test(c)) return "right";
    if (ALIGN_LEFT.test(c)) return "left";
    return "none";
  });
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEME = /^(https?|mailto):/i;
const EXTERNAL_HREF = /^https?:\/\//i;

interface RenderedInline {
  html: string;
  /** Source offset of each character of the rendered text. */
  map: number[];
}

const CODE_SPAN = /^(`+)([\s\S]*?)\1/;
const IMAGE = /^!\[([^\]]*)\]\(([^\s)]+)\)/;
const LINK_TARGET = /^\(([^\s)]+)\)/;
const AUTOLINK = /^<((?:https?:\/\/)[^<>\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/;
const EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

interface EmphasisMarker {
  marker: string;
  open: string;
  close: string;
  wordBound?: boolean;
}

const EMPHASIS: EmphasisMarker[] = [
  { marker: "~~", open: "<del>", close: "</del>" },
  { marker: "**", open: "<strong>", close: "</strong>" },
  { marker: "__", open: "<strong>", close: "</strong>", wordBound: true },
  { marker: "*", open: "<em>", close: "</em>" },
  { marker: "_", open: "<em>", close: "</em>", wordBound: true },
];

const isWordChar = (ch: string): boolean => /\w/.test(ch);

/**
 * Renders the inline subset a table cell supports — code, strike, emphasis,
 * links, images and autolinks — and records the source offset of every rendered
 * character, so a click in the widget can be mapped back to the raw cell.
 * Inline HTML, bare URLs, math, footnotes and reference links are not part of
 * the subset.
 */
function renderInline(source: string): RenderedInline {
  const html: string[] = [];
  const map: number[] = [];

  const text = (value: string, from: number) => {
    html.push(escapeHtml(value));
    for (let i = 0; i < value.length; i++) map.push(from + i);
  };
  const inline = (value: string, from: number) => {
    const rendered = renderInline(value);
    html.push(rendered.html);
    for (const offset of rendered.map) map.push(from + offset);
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);

    const code = CODE_SPAN.exec(rest);
    if (code) {
      const content = code[2];
      html.push(`<code>${escapeHtml(content)}</code>`);
      for (let k = 0; k < content.length; k++) map.push(i + code[1].length + k);
      i += code[0].length;
      continue;
    }

    const image = IMAGE.exec(rest);
    if (image) {
      const [, alt, url] = image;
      // Same scheme gate as links: a cell must not be able to load its own URL scheme.
      if (HAS_SCHEME.test(url) && !SAFE_SCHEME.test(url)) {
        text(image[0], i);
      } else {
        // The source is resolved against the tab directory when the widget enters
        // the DOM, where the view (and its tab) is known; a bare relative src
        // here would fire a request against the app origin first.
        html.push(
          `<img class="cm-table-image" data-raw-src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" draggable="false">`,
        );
      }
      i += image[0].length;
      continue;
    }

    if (source.charAt(i) === "[") {
      const labelEnd = source.indexOf("]", i + 1);
      const target = labelEnd < 0 ? null : LINK_TARGET.exec(source.slice(labelEnd + 1));
      if (labelEnd >= 0 && target) {
        const end = labelEnd + 1 + target[0].length;
        const url = target[1];
        // Relative paths and `#anchors` have no scheme; reject schemes a table
        // cell must not be able to invoke.
        if (HAS_SCHEME.test(url) && !SAFE_SCHEME.test(url)) {
          text(source.slice(i, end), i);
        } else {
          const attrs = EXTERNAL_HREF.test(url) ? ' target="_blank" rel="noreferrer"' : "";
          html.push(`<a href="${escapeHtml(url)}"${attrs}>`);
          inline(source.slice(i + 1, labelEnd), i + 1);
          html.push("</a>");
        }
        i = end;
        continue;
      }
    }

    const auto = AUTOLINK.exec(rest);
    if (auto) {
      const target = auto[1];
      const email = EMAIL.test(target);
      const href = email ? `mailto:${target}` : target;
      const attrs = email ? "" : ' target="_blank" rel="noreferrer"';
      html.push(`<a href="${escapeHtml(href)}"${attrs}>${escapeHtml(target)}</a>`);
      for (let k = 0; k < target.length; k++) map.push(i + 1 + k);
      i += auto[0].length;
      continue;
    }

    const emphasis = EMPHASIS.find(
      ({ marker, wordBound }) => rest.startsWith(marker) && (!wordBound || !isWordChar(source.charAt(i - 1))),
    );
    if (emphasis) {
      const { marker, open, close, wordBound } = emphasis;
      const contentStart = i + marker.length;
      const contentEnd = source.indexOf(marker, contentStart);
      if (contentEnd > contentStart && (!wordBound || !isWordChar(source.charAt(contentEnd + marker.length)))) {
        html.push(open);
        inline(source.slice(contentStart, contentEnd), contentStart);
        html.push(close);
        i = contentEnd + marker.length;
        continue;
      }
    }

    text(source.charAt(i), i);
    i += 1;
  }

  return { html: html.join(""), map };
}

export function renderCell(cell: string): string {
  return renderInline(cell).html;
}

function alignAttr(alignment: TableAlignment): string {
  if (alignment === "none") return "";
  return ` style="text-align:${alignment}"`;
}

export interface RenderedCell {
  /** Offset of the cell's content within the table source. */
  offset: number;
  /** Source offset of each rendered character, relative to the cell content. */
  map: number[];
}

export interface RenderedTable {
  html: string;
  /** Rendered cells in DOM order: header cells, then body rows. */
  cells: RenderedCell[];
}

export function renderTable(source: string): RenderedTable {
  const rows = source.split("\n");
  const lineStarts: number[] = [];
  let lineStart = 0;
  for (const row of rows) {
    lineStarts.push(lineStart);
    lineStart += row.length + 1;
  }

  const content = rows.map((row) => row.replace(BLOCKQUOTE_PREFIX, ""));
  const alignment = parseAlignment(content[1] ?? "");
  const cells: RenderedCell[] = [];

  const rowCells = (rowIndex: number, tag: "th" | "td"): string => {
    const row = content[rowIndex] ?? "";
    const prefix = (rows[rowIndex]?.length ?? 0) - row.length;
    return splitRowWithOffsets(row)
      .map((cell, index) => {
        const rendered = renderInline(cell.value);
        cells.push({ offset: lineStarts[rowIndex] + prefix + cell.start, map: rendered.map });
        return `<${tag}${alignAttr(alignment[index] ?? "none")}>${rendered.html}</${tag}>`;
      })
      .join("");
  };

  const headerHtml = rowCells(0, "th");
  const bodyHtml = content
    .slice(2)
    .map((_, bodyIndex) => `<tr>${rowCells(bodyIndex + 2, "td")}</tr>`)
    .join("");
  return {
    html: `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`,
    cells,
  };
}

export interface TableWidgetRange {
  from: number;
  to: number;
  html: string;
  cells: RenderedCell[];
}

function findTableSpans(
  state: EditorState,
  ranges?: ReadonlyArray<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  const spans: Array<{ from: number; to: number }> = [];
  const tree = syntaxTree(state);
  // Any caret or selection touching a table keeps it raw, so edits never land
  // in replaced text. Checking only the main range hid the text of a table
  // covered by a selection (or under an extra range).
  const inTable = (from: number, to: number) =>
    state.selection.ranges.some((range) =>
      range.empty ? range.from >= from && range.from <= to : range.from < to && range.to > from,
    );
  const collect = (from: number, to: number) => {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "Table") return;
        if (inTable(node.from, node.to)) return false;
        spans.push({ from: node.from, to: node.to });
        return false;
      },
    });
  };
  if (ranges) {
    for (const range of ranges) collect(range.from, range.to);
  } else {
    collect(0, state.doc.length);
  }
  return spans;
}

export function findTableWidgetRanges(state: EditorState): TableWidgetRange[] {
  return findTableSpans(state).map(({ from, to }) => ({
    from,
    to,
    ...renderTable(state.doc.sliceString(from, to)),
  }));
}

export function collectTableSpans(
  state: EditorState,
  viewport?: ReadonlyArray<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  return findTableSpans(state, viewport);
}

/**
 * Starts of the tables currently rendered as widgets. A selection-only update
 * only needs a rebuild when this set changes, i.e. when a caret enters or
 * leaves a table; moving the caret around elsewhere must not re-render tables.
 */
function renderedTableKey(state: EditorState): string {
  return findTableSpans(state)
    .map((span) => span.from)
    .join(",");
}

class MarkdownTableWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly html: string,
    private readonly cells: RenderedCell[],
    private readonly getTabDirectory: GetTabDirectory,
  ) {
    super();
  }

  eq(other: MarkdownTableWidget): boolean {
    return other.html === this.html && other.from === this.from && other.to === this.to;
  }

  ignoreEvent(_event: Event): boolean {
    return false;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-widget";
    wrapper.dataset.from = String(this.from);
    wrapper.dataset.to = String(this.to);
    wrapper.dataset.renderedWidget = "";
    wrapper.innerHTML = this.html;

    const images = wrapper.querySelectorAll<HTMLImageElement>("img[data-raw-src]");
    if (images.length > 0) {
      const directory = this.getTabDirectory(view);
      images.forEach((img) => {
        const rawSrc = img.dataset.rawSrc ?? "";
        delete img.dataset.rawSrc;
        img.src = resolveImageSrc(rawSrc, directory);
      });
    }

    const cellInfo = new Map<Element, RenderedCell>();
    wrapper.querySelectorAll("td, th").forEach((cell, index) => {
      const info = this.cells[index];
      if (info) cellInfo.set(cell, info);
    });
    registerWidgetOffset(wrapper, (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const cell = target?.closest("td, th");
      const info = cell ? cellInfo.get(cell) : undefined;
      if (!cell || !info) return this.from;
      const hit = textOffsetAt(event, cell) ?? 0;
      const within =
        info.map.length === 0 ? 0 : hit >= info.map.length ? info.map[info.map.length - 1] + 1 : info.map[hit];
      return this.from + info.offset + within;
    });

    // Same Ctrl/Cmd+Click as rendered links in the document body.
    wrapper.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target instanceof Element ? event.target : null;
      const href = target?.closest("a")?.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      if (href.startsWith("#")) {
        jumpToAnchor(view, decodeHref(href.slice(1)));
      } else {
        void navigateToPath(href);
      }
    });
    // Link activation is the click event's default, which mousedown cannot
    // cancel; block it so a plain click can never navigate the webview.
    wrapper.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("a")) event.preventDefault();
    });
    return wrapper;
  }
}

function buildTableDecorations(state: EditorState, getTabDirectory: GetTabDirectory): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const table of findTableWidgetRanges(state)) {
    ranges.push(tableWidgetDeco(table.from, table.to, table.html, table.cells, getTabDirectory));
    const lineStart = state.doc.lineAt(table.from).from;
    if (lineStart < table.from) {
      ranges.push(Decoration.replace({}).range(lineStart, table.from));
    }
  }
  return Decoration.set(ranges, true);
}

function tableWidgetDeco(
  from: number,
  to: number,
  html: string,
  cells: RenderedCell[],
  getTabDirectory: GetTabDirectory,
): Range<Decoration> {
  return Decoration.replace({
    widget: new MarkdownTableWidget(from, to, html, cells, getTabDirectory),
  }).range(from, to);
}

export function createTableWidgetField(getTabDirectory: GetTabDirectory): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildTableDecorations(state, getTabDirectory);
    },
    update(decorations, tr) {
      // The background parser grows the syntax tree asynchronously via
      // Language.setState transactions (no doc/selection change). A table
      // outside the initially-parsed region (first ~3000 chars) would stay
      // raw until the next click unless we also rebuild when the tree grows,
      // e.g. right after a tab switch restores a deep scroll position.
      if (!tr.docChanged && syntaxTree(tr.startState) === syntaxTree(tr.state)) {
        if (renderedTableKey(tr.startState) === renderedTableKey(tr.state)) return decorations;
      }
      // shortcut: a doc change re-renders every table in the document, not only the
      // changed ones; add per-table HTML reuse if typing in table-heavy files lags.
      return buildTableDecorations(tr.state, getTabDirectory);
    },
    provide: (field) => EditorView.decorations.compute([field], (state) => state.field(field)),
  });
}
