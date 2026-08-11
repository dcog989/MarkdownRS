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
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  if (cells.length > 0 && cells[0].trim() === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((cell) => cell.trim());
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

export const tableWidgetClickHandler = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    const target = event.target as Node | null;
    const element = target instanceof Element ? target : target?.parentElement;
    const widget = element?.closest<HTMLElement>('.cm-table-widget');
    if (!widget) return false;

    const from = Number(widget.dataset.from);
    const to = Number(widget.dataset.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;

    event.preventDefault();
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const anchor = pos === null ? from : Math.min(Math.max(pos, from), to);
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
