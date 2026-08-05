import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { frontmatterExtension } from './frontmatterExtension';
import { createMarkdownDecorationsPlugin, matchCalloutLine } from './markdownExtensions';

describe('frontmatterExtension', () => {
  function parseDoc(doc: string) {
    const state = EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage, extensions: frontmatterExtension })],
    });
    const names: string[] = [];
    syntaxTree(state).iterate({
      enter: (n) => {
        names.push(n.name);
      },
    });
    return names;
  }

  it('parses a YAML frontmatter block as a single Frontmatter node', () => {
    const names = parseDoc('---\ntitle: Test\n---\n# Body\n');
    expect(names).toContain('Frontmatter');
    expect(names).not.toContain('SetextHeading2');
  });

  it('parses TOML and JSON frontmatter blocks', () => {
    expect(parseDoc('+++\ntitle = "Test"\n+++\n# Body\n')).toContain('Frontmatter');
    expect(parseDoc(';;;\n{"title": "Test"}\n;;;\n# Body\n')).toContain('Frontmatter');
    expect(parseDoc('{\n"title": "Test"\n}\n# Body\n')).toContain('Frontmatter');
  });

  it('parses pretty-printed JSON frontmatter without closing on the body brace', () => {
    const names = parseDoc(';;;\n{\n  "title": "Test"\n}\n;;;\n# Body\n');
    expect(names).toContain('Frontmatter');
    expect(names.filter((n) => n === 'Paragraph').length).toBe(0);
  });

  it('does not treat a mid-document --- as frontmatter', () => {
    const names = parseDoc('Before\n---\nAfter\n');
    expect(names).not.toContain('Frontmatter');
  });
});

describe('matchCalloutLine', () => {
  it('matches a callout marker and reports the marker offset', () => {
    const m = matchCalloutLine('> [!NOTE] Body text');
    expect(m).toEqual({ start: 2, raw: '[!NOTE]', kind: 'note' });
  });

  it('matches markers case-insensitively', () => {
    expect(matchCalloutLine('> [!important]')?.kind).toBe('important');
    expect(matchCalloutLine('> [!Caution]')?.kind).toBe('caution');
  });

  it('handles indented markers and empty bodies', () => {
    const m = matchCalloutLine('   > [!TIP]');
    expect(m?.start).toBe(5);
    expect(m?.kind).toBe('tip');
  });

  it('rejects non-callout quotes and unsupported types', () => {
    expect(matchCalloutLine('> regular quote')).toBeNull();
    expect(matchCalloutLine('> [!CUSTOM]')).toBeNull();
    expect(matchCalloutLine('plain text')).toBeNull();
  });

  it('rejects markers not at the start of the line', () => {
    expect(matchCalloutLine('text > [!NOTE]')).toBeNull();
  });
});

const originalGetClientRects = Range.prototype.getClientRects;
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

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

const highlightStyle = HighlightStyle.define([{ tag: t.quote, class: 'cm-blockquote' }]);

function createCalloutView(doc: string, rendered: boolean, cursorPos?: number) {
  const parent = document.createElement('div');
  parent.style.width = '800px';
  parent.style.height = '600px';
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos ?? doc.length },
    extensions: [
      markdown({ base: markdownLanguage, extensions: frontmatterExtension }),
      syntaxHighlighting(highlightStyle),
      createMarkdownDecorationsPlugin(rendered),
    ],
  });
  return { view: new EditorView({ state, parent }), parent };
}

describe('callout decorations', () => {
  beforeEach(mockLayout);
  afterEach(() => {
    restoreLayout();
    document.body.innerHTML = '';
  });

  it('colors the marker span in raw mode', async () => {
    const { view, parent } = createCalloutView('> [!NOTE] Some text\n> more\n', false);
    await new Promise((r) => setTimeout(r, 50));
    const line = parent.querySelector('.cm-line');
    expect(line?.className).toContain('cm-callout cm-callout-note');
    expect(parent.querySelector('.cm-callout-marker .cm-blockquote')?.textContent).toBe('[!NOTE]');
    view.destroy();
  });

  it('keeps raw-mode callout colored while the cursor is inside it', async () => {
    const { view, parent } = createCalloutView('> [!NOTE] Some text\n> more\n', false, 8);
    await new Promise((r) => setTimeout(r, 50));
    expect(parent.querySelector('.cm-callout-marker')).not.toBeNull();
    expect(parent.querySelector('.cm-line')?.className).toContain('cm-callout cm-callout-note');
    view.destroy();
  });

  it('renders the title widget in rendered mode', async () => {
    const { view, parent } = createCalloutView('> [!NOTE] Some text\n> more\n', true);
    await new Promise((r) => setTimeout(r, 50));
    expect(parent.querySelector('.cm-callout-title-text')?.textContent).toBe('Note');
    expect(parent.querySelector('.cm-line')?.className).toContain('cm-callout cm-callout-note');
    view.destroy();
  });

  it('shows the editable marker text in rendered mode while the cursor is inside', async () => {
    const { view, parent } = createCalloutView('> [!NOTE] Some text\n> more\n', true, 8);
    await new Promise((r) => setTimeout(r, 50));
    const marker = parent.querySelector('.cm-callout-marker');
    expect(marker).not.toBeNull();
    expect(marker?.textContent).toContain('[!NOTE]');
    view.destroy();
  });
});

describe('horizontal rule decorations', () => {
  beforeEach(mockLayout);
  afterEach(() => {
    restoreLayout();
    document.body.innerHTML = '';
  });

  function lineWithText(parent: HTMLElement, text: string): Element | undefined {
    return Array.from(parent.querySelectorAll('.cm-line')).find((l) => l.textContent === text);
  }

  it('masks a real horizontal rule outside a code block', async () => {
    const { view, parent } = createCalloutView('Before\n---\nAfter\n', true);
    await new Promise((r) => setTimeout(r, 50));
    expect(lineWithText(parent, '---')?.querySelector('.cm-hr')).not.toBeNull();
    view.destroy();
  });

  it('does not mask a --- line inside a fenced code block', async () => {
    const { view, parent } = createCalloutView('```\n---\n```\n', true);
    await new Promise((r) => setTimeout(r, 50));
    expect(lineWithText(parent, '---')?.querySelector('.cm-hr')).toBeNull();
    view.destroy();
  });

  it('does not mask frontmatter delimiters as horizontal rules', async () => {
    const { view, parent } = createCalloutView('---\ntitle: Test\n---\n\n# Body\n', true);
    await new Promise((r) => setTimeout(r, 50));
    expect(lineWithText(parent, '---')?.querySelector('.cm-hr')).toBeNull();
    view.destroy();
  });
});
