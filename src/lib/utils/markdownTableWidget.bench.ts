import { describe, test } from "vitest";
import { renderTable } from "./markdownTableWidget";

const SMALL_TABLE = "| Name | Price |\n| --- | ---: |\n| A | 1.5 |\n| B | 2.5 |\n";
const BODY_ROWS = Array.from(
  { length: 100 },
  (_, i) => `| row ${i} | **bold** \`code\` | [link](https://example.com) |`,
).join("\n");
const LARGE_TABLE = `| A | B | C |\n| --- | --- | --- |\n${BODY_ROWS}\n`;

describe("renderTable", () => {
  test("small table (2 body rows)", async ({ bench }) => {
    bench("renderTable", () => renderTable(SMALL_TABLE));
  });

  test("large table (100 body rows with emphasis)", async ({ bench }) => {
    bench("renderTable", () => renderTable(LARGE_TABLE));
  });
});
