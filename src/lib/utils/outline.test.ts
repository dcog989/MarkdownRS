import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { editorMarkdownExtensions } from "./frontmatterExtension";
import { collectOutlineHeadings } from "./outline";

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
