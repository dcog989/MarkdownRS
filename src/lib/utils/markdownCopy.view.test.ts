import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CodeBlockCopyDeps, createCodeBlockCopyHandler } from "./markdownCopy";
import { createMarkdownDecorationsPlugin } from "./markdownExtensions";

const TOAST_FAILURE = "common.copyFailed";

const originalGetClientRects = Range.prototype.getClientRects;
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function mockLayout() {
  Range.prototype.getClientRects = () =>
    [
      { left: 0, right: 800, top: 0, bottom: 20, width: 800, height: 20, x: 0, y: 0, toJSON: () => ({}) },
    ] as unknown as DOMRectList;
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, right: 800, top: 0, bottom: 20, width: 800, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

function restoreLayout() {
  Range.prototype.getClientRects = originalGetClientRects;
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

function createEditor(doc: string, deps: CodeBlockCopyDeps) {
  const parent = document.createElement("div");
  parent.style.width = "800px";
  parent.style.height = "600px";
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: 0 },
    extensions: [
      markdown({ base: markdownLanguage }),
      createMarkdownDecorationsPlugin(true, () => ""),
      createCodeBlockCopyHandler(deps),
    ],
  });
  return { view: new EditorView({ state, parent }), parent };
}

function createDeps(toasts: Array<[string, string]>): CodeBlockCopyDeps {
  return {
    translate: (key) => key,
    showToast: (type, message) => toasts.push([type, message]),
  };
}

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

async function clickCodeInfo(view: EditorView, parent: HTMLElement, infoPos: number) {
  vi.spyOn(view, "posAtCoords").mockReturnValue(infoPos);
  const info = parent.querySelector(".cm-code-info");
  expect(info).not.toBeNull();
  info?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 10, clientY: 10 }));
  await nextFrame();
}

describe("code block copy handler", () => {
  beforeEach(mockLayout);
  afterEach(() => {
    restoreLayout();
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
    document.body.innerHTML = "";
  });

  it("copies a ~~~ block without its closing fence", async () => {
    const doc = "Text\n\n~~~js\nconst x = 1;\n~~~\n";
    const written: string[] = [];
    const toasts: Array<[string, string]> = [];
    const { view, parent } = createEditor(doc, createDeps(toasts));
    stubClipboard(async (text) => {
      written.push(text);
    });

    await nextFrame();
    await clickCodeInfo(view, parent, doc.indexOf("js"));

    expect(written).toEqual(["const x = 1;"]);
    expect(toasts).toEqual([]);
    view.destroy();
  });

  it("copies a ``` block without its closing fence", async () => {
    const doc = "Text\n\n```js\nconst x = 1;\n```\n";
    const written: string[] = [];
    const toasts: Array<[string, string]> = [];
    const { view, parent } = createEditor(doc, createDeps(toasts));
    stubClipboard(async (text) => {
      written.push(text);
    });

    await nextFrame();
    await clickCodeInfo(view, parent, doc.indexOf("js"));

    expect(written).toEqual(["const x = 1;"]);
    view.destroy();
  });

  it("reports a clipboard failure", async () => {
    const doc = "Text\n\n~~~js\nconst x = 1;\n~~~\n";
    const written: string[] = [];
    const toasts: Array<[string, string]> = [];
    const { view, parent } = createEditor(doc, createDeps(toasts));
    stubClipboard(async (text) => {
      written.push(text);
      throw new Error("denied");
    });

    await nextFrame();
    await clickCodeInfo(view, parent, doc.indexOf("js"));

    expect(written).toEqual(["const x = 1;"]);
    expect(toasts).toEqual([["error", TOAST_FAILURE]]);
    view.destroy();
  });
});
