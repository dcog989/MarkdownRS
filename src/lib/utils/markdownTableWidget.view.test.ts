import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMarkdownDecorationsPlugin } from "./markdownExtensions";
import { findTableWidgetRanges } from "./markdownTableWidget";

const TABLE_SOURCE = `| Name | Price |
| --- | ---: |
| A | 1.5 |
`;

const PRECEDED_SOURCE = `Intro

| Name | Price |
| --- | ---: |
| A | 1.5 |
`;

const TWO_TABLES_SOURCE = `| Name | Price |
| --- | ---: |
| A | 1.5 |

| Q | A |
| --- | --- |
| x | y |
`;

function createState(doc: string, cursorPos: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage })],
  });
}

describe("findTableWidgetRanges", () => {
  it("widgetizes a table when the cursor is outside it", () => {
    const ranges = findTableWidgetRanges(createState(PRECEDED_SOURCE, 0));

    expect(ranges).toHaveLength(1);
    expect(ranges[0].html).toContain("<table>");
    expect(ranges[0].html).toContain("<th>Name</th>");
    expect(ranges[0].html).toContain('<th style="text-align:right">Price</th>');
  });

  it("leaves the table raw when the cursor is inside it", () => {
    expect(findTableWidgetRanges(createState(TABLE_SOURCE, 20))).toHaveLength(0);
  });

  it("widgetizes only the tables the cursor is not inside", () => {
    const ranges = findTableWidgetRanges(createState(TWO_TABLES_SOURCE, 70));

    expect(ranges).toHaveLength(1);
    expect(ranges[0].html).toContain("<th>Name</th>");
  });
});

const originalGetClientRects = Range.prototype.getClientRects;
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");

function mockLayout() {
  Range.prototype.getClientRects = () =>
    [
      { left: 0, right: 800, top: 0, bottom: 20, width: 800, height: 20, x: 0, y: 0, toJSON: () => ({}) },
    ] as unknown as DOMRectList;
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, right: 800, top: 0, bottom: 20, width: 800, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
}

function restoreLayout() {
  Range.prototype.getClientRects = originalGetClientRects;
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  Object.defineProperty(window, "innerHeight", originalInnerHeight ?? { value: 0, configurable: true });
}

function createEditor(doc: string, cursorPos: number) {
  const parent = document.createElement("div");
  parent.style.width = "800px";
  parent.style.height = "600px";
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage }), createMarkdownDecorationsPlugin(true, () => "")],
  });
  const view = new EditorView({ state, parent });
  return { view, parent };
}

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

beforeEach(mockLayout);
afterEach(() => {
  restoreLayout();
  document.body.innerHTML = "";
});

describe("table widget integration", () => {
  it("renders a table widget when the cursor is outside the table", async () => {
    const { view, parent } = createEditor(PRECEDED_SOURCE, 0);
    await nextFrame();

    const widget = parent.querySelector(".cm-table-widget table");
    expect(widget).not.toBeNull();
    expect(widget?.textContent).toContain("Name");
    expect(widget?.textContent).toContain("1.5");
    view.destroy();
  });

  it("shows raw table source when the cursor is inside the table", async () => {
    const { view, parent } = createEditor(TABLE_SOURCE, 30);
    await nextFrame();

    expect(parent.querySelector(".cm-table-widget")).toBeNull();
    expect(parent.textContent).toContain("| --- | ---: |");
    view.destroy();
  });

  it("unrenders the widget when the cursor moves into the table", async () => {
    const { view, parent } = createEditor(PRECEDED_SOURCE, 0);
    await nextFrame();
    expect(parent.querySelector(".cm-table-widget")).not.toBeNull();

    view.dispatch({ selection: { anchor: 25 } });
    await nextFrame();
    expect(parent.querySelector(".cm-table-widget")).toBeNull();
    expect(parent.textContent).toContain("| A | 1.5 |");
    view.destroy();
  });

  it("re-renders the widget when the cursor moves back out", async () => {
    const { view, parent } = createEditor(PRECEDED_SOURCE, 25);
    await nextFrame();
    expect(parent.querySelector(".cm-table-widget")).toBeNull();

    view.dispatch({ selection: { anchor: 0 } });
    await nextFrame();
    expect(parent.querySelector(".cm-table-widget")).not.toBeNull();
    view.destroy();
  });

  it("switches to raw markdown when the widget is clicked anywhere", async () => {
    const { view, parent } = createEditor(PRECEDED_SOURCE, 0);
    await nextFrame();

    const widget = parent.querySelector(".cm-table-widget") as HTMLElement;
    expect(widget).not.toBeNull();
    const from = Number(widget.dataset.from);
    const to = Number(widget.dataset.to);

    widget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 100 }));
    await nextFrame();

    expect(parent.querySelector(".cm-table-widget")).toBeNull();
    expect(parent.textContent).toContain("| A | 1.5 |");
    const head = view.state.selection.main.head;
    expect(head).toBeGreaterThanOrEqual(from);
    expect(head).toBeLessThanOrEqual(to);
    view.destroy();
  });

  it("places the caret at the clicked cell in the raw source", async () => {
    const { view, parent } = createEditor(PRECEDED_SOURCE, 0);
    await nextFrame();

    const widget = parent.querySelector(".cm-table-widget") as HTMLElement;
    const priceCell = widget.querySelectorAll("tbody td")[1] as HTMLElement;
    priceCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 100 }));
    await nextFrame();

    const head = view.state.selection.main.head;
    expect(view.state.doc.sliceString(head, head + 3)).toBe("1.5");
    view.destroy();
  });
});
