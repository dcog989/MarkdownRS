import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/backend", () => ({
  callBackendSafe: vi.fn(),
}));

import { callBackendSafe } from "$lib/utils/backend";
import { renderMarkdown } from "./markdownRust";

const mockedBackend = vi.mocked(callBackendSafe);

function backendReturns(html: string): void {
  mockedBackend.mockImplementation((async () => ({ html, headings: [] })) as unknown as typeof callBackendSafe);
}

describe("renderMarkdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps source positions and strips scripts, event handlers and javascript: links", async () => {
    backendReturns(
      '<h1 id="t" data-sourcepos="1:1-1:3">Hi <strong>there</strong></h1>' +
        '<p onclick="alert(1)">x</p><script>alert(1)</script>' +
        '<a href="javascript:alert(1)">link</a>',
    );

    const { html } = await renderMarkdown("ignored");

    expect(html).toContain('data-sourcepos="1:1-1:3"');
    expect(html).toContain("<strong>there</strong>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("resolves relative images against the render tab's directory", async () => {
    backendReturns('<p><img src="pic.png"></p>');

    const docs = await renderMarkdown("ignored", true, "/docs/note.md");
    const root = await renderMarkdown("ignored", true, "/note.md");

    expect(docs.html).toContain('src="/docs/pic.png"');
    expect(root.html).toContain('src="/pic.png"');
  });
});
