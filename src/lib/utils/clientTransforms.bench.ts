import { describe, test } from "vitest";
import { toSnakeCase, toTitleCase } from "./clientTransforms/case";
import { removeDuplicates, reverseLines, sortLines } from "./clientTransforms/lines";
import { increaseHeading, toggleBlockquote } from "./clientTransforms/markdown";
import { smartParagraphs } from "./clientTransforms/paragraphs";

const DOC_LINES = Array.from(
  { length: 500 },
  (_, i) => `## Section ${i}\n\nParagraph number ${i} with some **bold** words and a [link](https://example.com/${i}).`,
);
const DOC = DOC_LINES.join("\n\n");

describe("text transforms (500-section document)", () => {
  test("toSnakeCase", async ({ bench }) => {
    bench("toSnakeCase", () => toSnakeCase(DOC));
  });

  test("toTitleCase", async ({ bench }) => {
    bench("toTitleCase", () => toTitleCase(DOC));
  });

  test("sortLines ascending", async ({ bench }) => {
    bench("sortLines ascending", () => sortLines(DOC, "asc"));
  });

  test("reverseLines", async ({ bench }) => {
    bench("reverseLines", () => reverseLines(DOC));
  });

  test("removeDuplicates", async ({ bench }) => {
    bench("removeDuplicates", () => removeDuplicates(DOC));
  });

  test("toggleBlockquote", async ({ bench }) => {
    bench("toggleBlockquote", () => toggleBlockquote(DOC));
  });

  test("increaseHeading", async ({ bench }) => {
    bench("increaseHeading", () => increaseHeading(DOC));
  });

  test("smartParagraphs", async ({ bench }) => {
    bench("smartParagraphs", () => smartParagraphs(DOC));
  });
});
