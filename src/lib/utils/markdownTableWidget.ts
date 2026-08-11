import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import { type EditorState, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

export type TableAlignment = 'left' | 'center' | 'right' | 'none';

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
  let current = '';
  let currentStart = 0;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push({ value: current, start: currentStart });
      current = '';
      currentStart = i + 1;
      continue;
    }
    current += ch;
  }
  cells.push({ value: current, start: currentStart });
  if (cells.length > 0 && cells[0].value.trim() === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].value.trim() === '') cells.pop();
  return cells.map(({ value, start }) => {
    const trimmed = value.trim();
    return { value: trimmed, start: start + value.indexOf(trimmed) };
  });
}

export function parseAlignment(delimiter: string): TableAlignment[] {
  return splitRow(delimiter).map((cell) => {
    const c = cell.trim();
    if (ALIGN_CENTER.test(c)) return 'center';
    if (ALIGN_RIGHT.test(c)) return 'right';
    if (ALIGN_LEFT.test(c)) return 'left';
    return 'none';
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PLACEHOLDER_START = '\uE000';
const PLACEHOLDER_END = '\uE001';

export function renderCell(cell: string): string {
  const codeSpans: string[] = [];
  const escaped = escapeHtml(cell);
  const withCodePlaceholders = escaped.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `${PLACEHOLDER_START}${codeSpans.length - 1}${PLACEHOLDER_END}`;
  });
  let html = withCodePlaceholders;
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  html = html.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/\b_([^_\n]+)_\b/g, '<em>$1</em>');
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)\]]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  // GFM autolinks: `<https://...>` and `<mail@example.com>`. The cell was
  // HTML-escaped above, so the angle brackets are `&lt;`/`&gt;`; a URL cannot
  // contain `>` so a lazy match up to the first `&gt;` is safe. Quotes are
  // re-escaped so the URL cannot break out of the href attribute.
  html = html.replace(/&lt;(https?:\/\/.*?)&gt;/g, (_match, url: string) => {
    const href = url.replace(/"/g, '&quot;');
    return `<a href="${href}" target="_blank" rel="noreferrer">${url}</a>`;
  });
  html = html.replace(/&lt;([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})&gt;/g, '<a href="mailto:$1">$1</a>');
  return html.replace(new RegExp(`${PLACEHOLDER_START}(\\d+)${PLACEHOLDER_END}`, 'g'), (_match, index: string) => {
    return codeSpans[Number(index)] ?? '';
  });
}

function alignAttr(alignment: TableAlignment): string {
  if (alignment === 'none') return '';
  return ` style="text-align:${alignment}"`;
}

export function renderTable(source: string): string {
  const rows = source.split('\n').map((row) => row.replace(BLOCKQUOTE_PREFIX, ''));
  const header = rows[0] ?? '';
  const delimiter = rows[1] ?? '';
  const body = rows.slice(2);
  const alignment = parseAlignment(delimiter);
  const headerCells = splitRow(header);
  const headerHtml = headerCells
    .map((cell, index) => `<th${alignAttr(alignment[index] ?? 'none')}>${renderCell(cell)}</th>`)
    .join('');
  const bodyHtml = body
    .map(
      (row) =>
        `<tr>${splitRow(row)
          .map((cell, index) => `<td${alignAttr(alignment[index] ?? 'none')}>${renderCell(cell)}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

export interface TableWidgetRange {
  from: number;
  to: number;
  html: string;
}

function findTableSpans(
  state: EditorState,
  ranges?: ReadonlyArray<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  const spans: Array<{ from: number; to: number }> = [];
  const tree = syntaxTree(state);
  const cursor = state.selection.main.head;
  const collect = (from: number, to: number) => {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Table') return;
        if (cursor >= node.from && cursor <= node.to) return false;
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
    html: renderTable(state.doc.sliceString(from, to)),
  }));
}

export function collectTableSpans(
  state: EditorState,
  viewport?: ReadonlyArray<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  return findTableSpans(state, viewport);
}

class MarkdownTableWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly html: string,
  ) {
    super();
  }

  eq(other: MarkdownTableWidget): boolean {
    return other.html === this.html && other.from === this.from && other.to === this.to;
  }

  ignoreEvent(_event: Event): boolean {
    return false;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-table-widget';
    wrapper.dataset.from = String(this.from);
    wrapper.dataset.to = String(this.to);
    wrapper.innerHTML = this.html;
    return wrapper;
  }
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const table of findTableWidgetRanges(state)) {
    ranges.push(tableWidgetDeco(table.from, table.to, table.html));
    const lineStart = state.doc.lineAt(table.from).from;
    if (lineStart < table.from) {
      ranges.push(Decoration.replace({}).range(lineStart, table.from));
    }
  }
  return Decoration.set(ranges, true);
}

function tableWidgetDeco(from: number, to: number, html: string): Range<Decoration> {
  return Decoration.replace({ widget: new MarkdownTableWidget(from, to, html) }).range(from, to);
}

/**
 * Maps a rendered cell (row index within the widget's thead/tbody, cell index
 * within that row) back to the caret position in the raw table source. Returns
 * the offset of the clicked cell's content start, or null when the row/cell
 * cannot be resolved against the source text.
 */
function tableRowToSourcePos(
  view: EditorView,
  from: number,
  to: number,
  sourceRowIndex: number,
  cellIndex: number,
): number | null {
  const source = view.state.doc.sliceString(from, to);
  const rows = source.split('\n');
  const rawLine = rows[sourceRowIndex];
  if (rawLine == null) return null;

  let lineOffset = 0;
  for (let i = 0; i < sourceRowIndex; i++) {
    lineOffset += rows[i].length + 1;
  }

  // The widget strips a blockquote prefix before rendering, so re-add it when
  // mapping the cell offset back to the document.
  const prefix = BLOCKQUOTE_PREFIX.exec(rawLine)?.[0] ?? '';
  const contentLine = rawLine.slice(prefix.length);
  const cell = splitRowWithOffsets(contentLine)[cellIndex];
  if (cell == null) return null;

  return from + lineOffset + prefix.length + cell.start;
}

export const tableWidgetClickHandler = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    const target = event.target as Node | null;
    const element = target instanceof Element ? target : target?.parentElement;
    const widget = element?.closest<HTMLElement>('.cm-table-widget');
    if (!widget) return false;

    const from = Number(widget.dataset.from);
    const to = Number(widget.dataset.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;

    const cell = element?.closest<HTMLElement>('td, th');

    let anchor: number;
    if (cell) {
      const row = cell.closest('tr');
      const table = cell.closest('table');
      if (!row || !table) return false;

      // The widget renders the header row (source row 0) as thead and the body
      // rows (source rows 2+) as tbody; source row 1 is the delimiter row.
      const headRows = Array.from(table.querySelectorAll('thead > tr'));
      const bodyRows = Array.from(table.querySelectorAll('tbody > tr'));

      let sourceRowIndex: number;
      if (headRows.includes(row)) {
        sourceRowIndex = 0;
      } else {
        const bodyIndex = bodyRows.indexOf(row);
        if (bodyIndex < 0) return false;
        sourceRowIndex = bodyIndex + 2;
      }

      const cellIndex = Array.from(row.children).indexOf(cell);
      if (cellIndex < 0) return false;

      anchor = tableRowToSourcePos(view, from, to, sourceRowIndex, cellIndex);
      if (anchor == null) return false;
    } else {
      // Clicked the widget chrome (padding or an empty row), not a cell; drop
      // the caret at the table start instead of guessing from pixels.
      anchor = from;
    }

    event.preventDefault();
    view.focus();
    view.dispatch({ selection: { anchor }, scrollIntoView: false });
    return true;
  },
});

export function createTableWidgetField(): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildTableDecorations(state);
    },
    update(decorations, tr) {
      // The background parser grows the syntax tree asynchronously via
      // Language.setState transactions (no doc/selection change). A table
      // outside the initially-parsed region (first ~3000 chars) would stay
      // raw until the next click unless we also rebuild when the tree grows,
      // e.g. right after a tab switch restores a deep scroll position.
      if (!tr.docChanged && tr.selection == null && syntaxTree(tr.startState) === syntaxTree(tr.state))
        return decorations;
      return buildTableDecorations(tr.state);
    },
    provide: (field) => EditorView.decorations.compute([field], (state) => state.field(field)),
  });
}
