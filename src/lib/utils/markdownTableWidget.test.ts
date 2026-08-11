import { describe, expect, it } from 'vitest';
import { parseAlignment, renderCell, renderTable, splitRow } from './markdownTableWidget';

describe('splitRow', () => {
  it('splits a row with leading and trailing pipes', () => {
    expect(splitRow('| Name | Price |')).toEqual(['Name', 'Price']);
  });

  it('splits a row without surrounding pipes', () => {
    expect(splitRow('Name | Price')).toEqual(['Name', 'Price']);
  });

  it('preserves empty cells in the middle', () => {
    expect(splitRow('| a | | b |')).toEqual(['a', '', 'b']);
  });

  it('handles escaped pipes', () => {
    expect(splitRow('| a \\| b | c |')).toEqual(['a | b', 'c']);
  });
});

describe('parseAlignment', () => {
  it('parses left, center, right and none', () => {
    expect(parseAlignment('| --- | :---: | ---: | :-- |')).toEqual(['none', 'center', 'right', 'left']);
  });

  it('returns none for a plain delimiter row', () => {
    expect(parseAlignment('| --- | --- |')).toEqual(['none', 'none']);
  });
});

describe('renderCell', () => {
  it('escapes html characters', () => {
    expect(renderCell('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('renders bold, italic, code, strike and highlight', () => {
    expect(renderCell('**bold**')).toBe('<strong>bold</strong>');
    expect(renderCell('*italic*')).toBe('<em>italic</em>');
    expect(renderCell('`code`')).toBe('<code>code</code>');
    expect(renderCell('~~strike~~')).toBe('<del>strike</del>');
    expect(renderCell('==mark==')).toBe('<mark>mark</mark>');
  });

  it('renders links', () => {
    expect(renderCell('[site](https://example.com)')).toBe(
      '<a href="https://example.com" target="_blank" rel="noreferrer">site</a>',
    );
  });

  it('renders url and email autolinks', () => {
    expect(renderCell('<https://example.com/a?b=1&c=2>')).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noreferrer">https://example.com/a?b=1&amp;c=2</a>',
    );
    expect(renderCell('<mail@example.com>')).toBe('<a href="mailto:mail@example.com">mail@example.com</a>');
  });

  it('escapes quotes inside autolinks', () => {
    expect(renderCell('<https://x.com/"onclick="alert(1)>')).toBe(
      '<a href="https://x.com/&quot;onclick=&quot;alert(1)" target="_blank" rel="noreferrer">https://x.com/"onclick="alert(1)</a>',
    );
  });

  it('does not format autolinks inside code spans', () => {
    expect(renderCell('`<https://example.com>`')).toBe('<code>&lt;https://example.com&gt;</code>');
  });

  it('does not format code inside emphasis markers', () => {
    expect(renderCell('`**not bold**`')).toBe('<code>**not bold**</code>');
  });
});

describe('renderTable', () => {
  it('renders a table with header and body rows', () => {
    const html = renderTable('| Name | Price |\n| --- | ---: |\n| A | 1.5 |');
    expect(html).toBe(
      '<table><thead><tr><th>Name</th><th style="text-align:right">Price</th></tr></thead><tbody><tr><td>A</td><td style="text-align:right">1.5</td></tr></tbody></table>',
    );
  });

  it('renders cell emphasis inside the table', () => {
    const html = renderTable('| A | B |\n| --- | --- |\n| **bold** | `code` |');
    expect(html).toContain('<td><strong>bold</strong></td>');
    expect(html).toContain('<td><code>code</code></td>');
  });

  it('strips blockquote prefixes from rows', () => {
    const html = renderTable('| Q | A |\n> | --- | --- |\n> | x | y |');
    expect(html).toContain('<th>Q</th>');
    expect(html).toContain('<td>x</td>');
  });
});
