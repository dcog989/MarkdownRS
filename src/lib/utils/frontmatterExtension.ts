import type { MarkdownExtension } from "@lezer/markdown";

const DELIMITERS = ["---", "+++", ";;;", "{"] as const;
const CLOSING_DELIMITER: Record<string, string> = {
  "---": "---",
  "+++": "+++",
  ";;;": ";;;",
  "{": "}",
};

function matchDelimiter(text: string): string | null {
  const trimmed = text.trimEnd();
  for (const d of DELIMITERS) {
    if (trimmed === d) return d;
  }
  return null;
}

/**
 * Parses a leading frontmatter block (`---`, `+++`, `;;;`, or `{...}`) as a
 * single `Frontmatter` node. Without this, a YAML block's closing `---` line is
 * interpreted as a setext heading underline, styling the whole block as a
 * header in the editor.
 */
export const frontmatterExtension: MarkdownExtension = {
  defineNodes: [{ name: "Frontmatter", block: true }],
  parseBlock: [
    {
      name: "Frontmatter",
      before: "HorizontalRule",
      parse(cx, line) {
        if (cx.lineStart !== 0) return false;
        const open = matchDelimiter(line.text);
        if (!open) return false;
        const closing = CLOSING_DELIMITER[open];
        const from = cx.lineStart;
        let to = -1;

        while (cx.nextLine()) {
          if (line.text.trimEnd() === closing) {
            cx.nextLine();
            to = cx.prevLineEnd();
            break;
          }
        }

        if (to < 0) return false;
        cx.addElement(cx.elt("Frontmatter", from, to));
        return true;
      },
    },
  ],
};
