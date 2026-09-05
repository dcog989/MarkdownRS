import { describe, test } from "vitest";
import { hashContent } from "./contentHash";

const SHORT_DOC = "# Title\n\nSome **bold** text with a [link](https://example.com).\n";
const LONG_DOC =
  "# Big Document\n\n" +
  Array.from({ length: 2000 }, (_, i) => `Line ${i} with some content *here* and \`code\`.`).join("\n");
const HUGE_DOC = LONG_DOC.repeat(50);

describe("hashContent", () => {
  test("short doc (~80 chars)", async ({ bench }) => {
    bench("hashContent", () => hashContent(SHORT_DOC));
  });

  test("long doc (~90 KB)", async ({ bench }) => {
    bench("hashContent", () => hashContent(LONG_DOC));
  });

  test("huge doc (~4.5 MB)", async ({ bench }) => {
    bench("hashContent", () => hashContent(HUGE_DOC));
  });
});
