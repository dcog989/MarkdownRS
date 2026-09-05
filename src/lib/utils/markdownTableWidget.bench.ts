import { bench, describe } from "vitest";
import { renderTable } from "./markdownTableWidget";

const SMALL_TABLE = "| Name | Price |\n| --- | ---: |\n| A | 1.5 |\n| B | 2.5 |\n";
const BODY_ROWS = Array.from(
  { length: 100 },
  (_, i) => `| row ${i} | **bold** \`code\` | [link](https://example.com) |`,
).join("\n");
const LARGE_TABLE = `| A | B | C |\n| --- | --- | --- |\n${BODY_ROWS}\n`;

describe("renderTable", () => {
  bench("small table (2 body rows)", () => {
    renderTable(SMALL_TABLE);
  });

  bench("large table (100 body rows with emphasis)", () => {
    renderTable(LARGE_TABLE);
  });
});
