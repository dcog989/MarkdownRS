import { bench, describe } from "vitest";
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
  bench("toSnakeCase", () => {
    toSnakeCase(DOC);
  });

  bench("toTitleCase", () => {
    toTitleCase(DOC);
  });

  bench("sortLines ascending", () => {
    sortLines(DOC, "asc");
  });

  bench("reverseLines", () => {
    reverseLines(DOC);
  });

  bench("removeDuplicates", () => {
    removeDuplicates(DOC);
  });

  bench("toggleBlockquote", () => {
    toggleBlockquote(DOC);
  });

  bench("increaseHeading", () => {
    increaseHeading(DOC);
  });

  bench("smartParagraphs", () => {
    smartParagraphs(DOC);
  });
});
