import katex from 'katex';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMathCache, renderMathInHtml } from './katexRenderer';

vi.mock('katex', async (importOriginal) => {
  const actual = await importOriginal<typeof import('katex')>();
  return {
    ...actual,
    default: { ...actual.default, renderToString: vi.fn(actual.default.renderToString) },
  };
});

const renderToStringMock = () => katex.renderToString as unknown as ReturnType<typeof vi.fn>;

describe('renderMathInHtml', () => {
  beforeEach(() => {
    clearMathCache();
    renderToStringMock().mockClear();
  });

  it('renders inline math into a .katex span', () => {
    const html = renderMathInHtml('<p>E = <span data-math-style="inline">mc^2</span></p>');
    expect(html).toContain('katex');
    expect(html).not.toContain('data-math-style');
  });

  it('renders display math in display mode', () => {
    const html = renderMathInHtml('<span data-math-style="display">x = \\frac{1}{2}</span>');
    expect(html).toContain('katex-display');
  });

  it('handles math code fences', () => {
    const html = renderMathInHtml('<pre><code class="language-math" data-math-style="display">E = mc^2</code></pre>');
    expect(html).toContain('katex-display');
    expect(html).toContain('katex');
  });

  it('renders multiple expressions', () => {
    const html = renderMathInHtml(
      '<p><span data-math-style="inline">a^2</span> + <span data-math-style="inline">b^2</span></p>',
    );
    expect(html.match(/class="katex"/g)).toHaveLength(2);
  });

  it('returns input unchanged when no math is present', () => {
    const html = '<p>Hello <strong>world</strong></p>';
    expect(renderMathInHtml(html)).toBe(html);
  });

  it('renders errors inline without throwing', () => {
    const html = renderMathInHtml('<span data-math-style="inline">\\notacommand</span>');
    expect(html).toContain('katex');
    expect(html).toContain('notacommand');
  });

  it('caches renders by expression hash', () => {
    const input = '<p><span data-math-style="inline">x^2 + y^2</span></p>';
    renderMathInHtml(input);
    const first = renderToStringMock().mock.calls.length;

    renderMathInHtml(input);
    const second = renderToStringMock().mock.calls.length;

    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  it('distinguishes inline and display mode in the cache', () => {
    renderMathInHtml('<span data-math-style="inline">x^2</span>');
    renderMathInHtml('<span data-math-style="display">x^2</span>');

    expect(renderToStringMock()).toHaveBeenCalledTimes(2);
    expect(renderToStringMock().mock.calls[0][1]?.displayMode).toBe(false);
    expect(renderToStringMock().mock.calls[1][1]?.displayMode).toBe(true);
  });
});
