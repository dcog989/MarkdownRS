import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { hashContent } from './contentHash';
import { findTableWidgetRanges, renderTable } from './markdownTableWidget';
import { countWords } from './textMetrics';

const TABLE_COUNT = 100;
const ROWS_PER_TABLE = 20;

const LARGE_TABLE = `| Name | Price |\n| --- | ---: |\n${Array.from({ length: ROWS_PER_TABLE }, (_, i) => `| item ${i} | ${i}.5 |`).join('\n')}`;
const LARGE_DOC = Array.from({ length: TABLE_COUNT }, (_, i) => `## Section ${i}\n\n${LARGE_TABLE}`).join('\n\n');

// Generous budgets: these catch O(n^2) / pathological regressions without
// being flaky on slow CI runners.
const BUDGET_MS = {
  hash: 2_000,
  words: 2_000,
  table: 2_000,
  widgetize: 8_000,
};

describe('large document performance smoke', () => {
  it('hashes a ~100 KB document quickly', () => {
    const start = performance.now();
    hashContent(LARGE_DOC);
    expect(performance.now() - start).toBeLessThan(BUDGET_MS.hash);
  });

  it('counts words in a ~100 KB document quickly', () => {
    const start = performance.now();
    countWords(LARGE_DOC);
    expect(performance.now() - start).toBeLessThan(BUDGET_MS.words);
  });

  it('renders a wide table quickly', () => {
    const wideTable = `| ${Array.from({ length: 50 }, (_, i) => `col${i}`).join(' | ')} |\n| ${Array.from({ length: 50 }, () => '---').join(' | ')} |\n${Array.from({ length: 100 }, () => `| ${Array.from({ length: 50 }, (_, i) => `v${i}`).join(' | ')} |`).join('\n')}`;
    const start = performance.now();
    renderTable(wideTable);
    expect(performance.now() - start).toBeLessThan(BUDGET_MS.table);
  });

  it('finds table widget ranges across a large document quickly', () => {
    const state = EditorState.create({
      doc: LARGE_DOC,
      selection: { anchor: 0 },
      extensions: [markdown({ base: markdownLanguage })],
    });

    const start = performance.now();
    // CodeMirror parses large documents in chunks. ensureSyntaxTree produces a
    // fully parsed tree; a no-op transaction then attaches it to a state so the
    // measurement reflects rendering every table, not the chunked parser.
    ensureSyntaxTree(state, state.doc.length, 10_000);
    const parsedState = state.update({ selection: state.selection }).state;
    const ranges = findTableWidgetRanges(parsedState);
    const elapsed = performance.now() - start;

    expect(ranges).toHaveLength(TABLE_COUNT);
    expect(elapsed).toBeLessThan(BUDGET_MS.widgetize);
  });
});
