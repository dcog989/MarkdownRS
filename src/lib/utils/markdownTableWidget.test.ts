import { describe, expect, it } from "vitest";
import { parseAlignment, renderCell, renderTable, splitRow } from "./markdownTableWidget";

describe("splitRow", () => {
  it("splits a row with leading and trailing pipes", () => {
    expect(splitRow("| Name | Price |")).toEqual(["Name", "Price"]);
  });

  it("splits a row without surrounding pipes", () => {
    expect(splitRow("Name | Price")).toEqual(["Name", "Price"]);
  });

  it("preserves empty cells in the middle", () => {
    expect(splitRow("| a | | b |")).toEqual(["a", "", "b"]);
  });

  it("handles escaped pipes", () => {
    expect(splitRow("| a \\| b | c |")).toEqual(["a | b", "c"]);
  });
});

describe("parseAlignment", () => {
  it("parses left, center, right and none", () => {
    expect(parseAlignment("| --- | :---: | ---: | :-- |")).toEqual(["none", "center", "right", "left"]);
  });

  it("returns none for a plain delimiter row", () => {
    expect(parseAlignment("| --- | --- |")).toEqual(["none", "none"]);
  });
});

describe("renderCell", () => {
  it("escapes html characters", () => {
    expect(renderCell("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("renders bold, italic, code and strike", () => {
    expect(renderCell("**bold**")).toBe("<strong>bold</strong>");
    expect(renderCell("*italic*")).toBe("<em>italic</em>");
    expect(renderCell("`code`")).toBe("<code>code</code>");
    expect(renderCell("~~strike~~")).toBe("<del>strike</del>");
  });

  it("renders links", () => {
    expect(renderCell("[site](https://example.com)")).toBe(
      '<a href="https://example.com" target="_blank" rel="noreferrer">site</a>',
    );
  });

  it("renders relative and anchor links", () => {
    expect(renderCell("[music](#music)")).toBe('<a href="#music">music</a>');
    expect(renderCell("[readme](src/music/README.md)")).toBe('<a href="src/music/README.md">readme</a>');
    expect(renderCell("[`src/a.py`](#a)")).toBe('<a href="#a"><code>src/a.py</code></a>');
  });

  it("does not link unsafe schemes", () => {
    expect(renderCell("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
    expect(renderCell("[x](data:text/html,hi)")).toBe("[x](data:text/html,hi)");
  });

  it("renders images with the raw source kept for later resolution", () => {
    expect(renderCell("![alt](img/pic.png)")).toBe(
      '<img class="cm-table-image" data-raw-src="img/pic.png" alt="alt" draggable="false">',
    );
    expect(renderCell("![](https://example.com/a.png)")).toContain('data-raw-src="https://example.com/a.png"');
  });

  it("does not render images with unsafe schemes", () => {
    expect(renderCell("![x](javascript:alert(1))")).toBe("![x](javascript:alert(1))");
  });

  it("renders url and email autolinks", () => {
    expect(renderCell("<https://example.com/a?b=1&c=2>")).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noreferrer">https://example.com/a?b=1&amp;c=2</a>',
    );
    expect(renderCell("<mail@example.com>")).toBe('<a href="mailto:mail@example.com">mail@example.com</a>');
  });

  it("escapes quotes inside autolinks", () => {
    expect(renderCell('<https://x.com/"onclick="alert(1)>')).toBe(
      '<a href="https://x.com/&quot;onclick=&quot;alert(1)" target="_blank" rel="noreferrer">https://x.com/&quot;onclick=&quot;alert(1)</a>',
    );
  });

  it("escapes quotes inside link urls", () => {
    expect(renderCell('[x](https://a/"onclick="alert(1))')).toBe(
      '<a href="https://a/&quot;onclick=&quot;alert(1" target="_blank" rel="noreferrer">x</a>)',
    );
  });

  it("does not format autolinks inside code spans", () => {
    expect(renderCell("`<https://example.com>`")).toBe("<code>&lt;https://example.com&gt;</code>");
  });

  it("does not format code inside emphasis markers", () => {
    expect(renderCell("`**not bold**`")).toBe("<code>**not bold**</code>");
  });
});

describe("renderTable", () => {
  it("renders a table with header and body rows", () => {
    const { html } = renderTable("| Name | Price |\n| --- | ---: |\n| A | 1.5 |");
    expect(html).toBe(
      '<table><thead><tr><th>Name</th><th style="text-align:right">Price</th></tr></thead><tbody><tr><td>A</td><td style="text-align:right">1.5</td></tr></tbody></table>',
    );
  });

  it("renders cell emphasis inside the table", () => {
    const { html } = renderTable("| A | B |\n| --- | --- |\n| **bold** | `code` |");
    expect(html).toContain("<td><strong>bold</strong></td>");
    expect(html).toContain("<td><code>code</code></td>");
  });

  it("strips blockquote prefixes from rows", () => {
    const { html } = renderTable("| Q | A |\n> | --- | --- |\n> | x | y |");
    expect(html).toContain("<th>Q</th>");
    expect(html).toContain("<td>x</td>");
  });

  it("maps rendered characters to their source offsets", () => {
    const { cells } = renderTable("| A |\n| --- |\n| a **b** `c` |");
    expect(cells.map((cell) => cell.map)).toEqual([[0], [0, 1, 4, 7, 9]]);
    expect(cells.map((cell) => cell.offset)).toEqual([2, 16]);
  });

  it("maps link labels to their source offsets", () => {
    const { cells } = renderTable("| A |\n| --- |\n| see [x](#a) |");
    expect(cells[1].map).toEqual([0, 1, 2, 3, 5]);
  });

  it("maps characters inside formatted link labels", () => {
    const { cells } = renderTable("| A |\n| --- |\n| [`x`](#a) |");
    expect(cells[1].map).toEqual([2]);
  });
});
