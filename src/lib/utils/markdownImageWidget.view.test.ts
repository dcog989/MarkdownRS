import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMarkdownDecorationsPlugin } from './markdownExtensions';

const DATA_URI = 'data:image/png;base64,AAAA';
const IMAGE_SOURCE = `before ![photo](${DATA_URI}) after\n`;

const originalGetClientRects = Range.prototype.getClientRects;
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

function mockLayout() {
  Range.prototype.getClientRects = () =>
    [
      { left: 0, right: 800, top: 0, bottom: 20, width: 800, height: 20, x: 0, y: 0, toJSON: () => ({}) },
    ] as unknown as DOMRectList;
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, right: 800, top: 0, bottom: 20, width: 800, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
}

function restoreLayout() {
  Range.prototype.getClientRects = originalGetClientRects;
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  Object.defineProperty(window, 'innerHeight', originalInnerHeight ?? { value: 0, configurable: true });
}

function createEditor(doc: string, cursorPos: number) {
  const parent = document.createElement('div');
  parent.style.width = '800px';
  parent.style.height = '600px';
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage }), createMarkdownDecorationsPlugin(true, () => '')],
  });
  const view = new EditorView({ state, parent });
  return { view, parent };
}

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

beforeEach(mockLayout);
afterEach(() => {
  restoreLayout();
  document.body.innerHTML = '';
});

describe('image widget integration', () => {
  it('renders an image widget when the cursor is outside the image', async () => {
    const { view, parent } = createEditor(IMAGE_SOURCE, 0);
    await nextFrame();

    const img = parent.querySelector<HTMLImageElement>('.cm-image-widget');
    expect(img).not.toBeNull();
    expect(img?.alt).toBe('photo');
    view.destroy();
  });

  it('shows raw image source when the cursor is inside the image', async () => {
    const imageStart = IMAGE_SOURCE.indexOf('![');
    const { view, parent } = createEditor(IMAGE_SOURCE, imageStart + 2);
    await nextFrame();

    expect(parent.querySelector('.cm-image-widget')).toBeNull();
    expect(parent.textContent).toContain('![photo]');
    view.destroy();
  });

  it('unrenders the widget when the cursor moves into the image', async () => {
    const { view, parent } = createEditor(IMAGE_SOURCE, 0);
    await nextFrame();
    expect(parent.querySelector('.cm-image-widget')).not.toBeNull();

    view.dispatch({ selection: { anchor: IMAGE_SOURCE.indexOf('![photo]') + 1 } });
    await nextFrame();
    expect(parent.querySelector('.cm-image-widget')).toBeNull();
    expect(parent.textContent).toContain('![photo]');
    view.destroy();
  });

  it('switches to raw markdown when the widget is clicked', async () => {
    const { view, parent } = createEditor(IMAGE_SOURCE, 0);
    await nextFrame();

    const img = parent.querySelector<HTMLElement>('.cm-image-widget');
    expect(img).not.toBeNull();
    const from = Number(img?.dataset.from);

    img?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 400, clientY: 100 }));
    await nextFrame();

    expect(parent.querySelector('.cm-image-widget')).toBeNull();
    expect(parent.textContent).toContain('![photo]');
    expect(view.state.selection.main.head).toBe(from);
    view.destroy();
  });

  it('does not render widgets for remote image URLs with the data URI replaced by an http URL', async () => {
    const source = 'before ![x](https://example.com/a.png) after\n';
    const { view, parent } = createEditor(source, 0);
    await nextFrame();

    const img = parent.querySelector<HTMLImageElement>('.cm-image-widget');
    expect(img).not.toBeNull();
    expect(img?.src).toBe('https://example.com/a.png');
    view.destroy();
  });
});
