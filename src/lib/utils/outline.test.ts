import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { editorMarkdownExtensions } from "./frontmatterExtension";
import { collectOutlineHeadings, headingAnchor, jumpToAnchor } from "./outline";

function stateOf(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: editorMarkdownExtensions })],
  });
}

describe("collectOutlineHeadings", () => {
  it("lists ATX headings with level, text and line offset", () => {
    const state = stateOf("# Title\n\nBody\n\n## Section ##\n\n### Sub\n");

    expect(collectOutlineHeadings(state)).toEqual([
      { level: 1, text: "Title", from: 0 },
      { level: 2, text: "Section", from: state.doc.line(5).from },
      { level: 3, text: "Sub", from: state.doc.line(7).from },
    ]);
  });

  it("ignores headings inside fenced code and frontmatter", () => {
    const state = stateOf("---\ntitle: Doc\n---\n\n```md\n# not a heading\n```\n\n# Real\n");

    expect(collectOutlineHeadings(state).map((heading) => heading.text)).toEqual(["Real"]);
  });

  it("ignores setext headings, matching the renderer", () => {
    expect(collectOutlineHeadings(stateOf("Title\n=====\n\nBody\n"))).toEqual([]);
  });

  it("keeps a literal trailing hash that has no preceding space", () => {
    const headings = collectOutlineHeadings(stateOf("## C#\n\n## Section ##\n"));

    expect(headings.map((heading) => heading.text)).toEqual(["C#", "Section"]);
  });
});

describe("headingAnchor", () => {
  it("matches GitHub's slug for plain headings", () => {
    expect(headingAnchor("Formatting")).toBe("formatting");
    expect(headingAnchor("Usage")).toBe("usage");
    expect(headingAnchor("Some Heading!")).toBe("some-heading");
  });
});

describe("jumpToAnchor", () => {
  it("moves the cursor to the heading that owns the anchor", () => {
    const state = stateOf("# Title\n\n## Formatting\n\nBody\n");
    const view = new EditorView({ state });

    expect(jumpToAnchor(view, "formatting")).toBe(true);
    expect(view.state.selection.main.head).toBe(state.doc.line(3).from);

    view.destroy();
  });

  it("reports a miss instead of moving", () => {
    const state = stateOf("# Title\n");
    const view = new EditorView({ state });

    expect(jumpToAnchor(view, "missing")).toBe(false);
    expect(view.state.selection.main.head).toBe(0);

    view.destroy();
  });
});
