import { afterEach, describe, expect, it } from 'vitest';
import { clearHighlightCache, highlightCodeBlocks } from './syntaxHighlightRenderer';

let container: HTMLElement;

afterEach(() => {
  clearHighlightCache();
  container.remove();
});

function makeContainer(html: string): HTMLElement {
  container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

describe('highlightCodeBlocks', () => {
  it('highlights a known language code block', async () => {
    const container = makeContainer('<pre><code class="language-js">const x = 1;</code></pre>');
    await highlightCodeBlocks(container);
    const code = container.querySelector('code');
    if (!code) throw new Error('expected code block');
    expect(code.classList.contains('hljs')).toBe(true);
    expect(code.innerHTML).toContain('hljs-keyword');
  });

  it('skips mermaid, math, and plaintext blocks', async () => {
    const container = makeContainer(
      '<pre><code class="language-mermaid">flowchart TD</code></pre>' +
        '<pre><code class="language-math">E = mc^2</code></pre>' +
        '<pre><code class="language-plaintext">nothing to see</code></pre>' +
        '<pre><code>no language class</code></pre>',
    );
    await highlightCodeBlocks(container);
    container.querySelectorAll('code').forEach((code) => {
      expect(code.classList.contains('hljs')).toBe(false);
      expect(code.innerHTML).not.toContain('hljs-keyword');
    });
  });

  it('caches highlighted output across calls', async () => {
    const container = makeContainer('<pre><code class="language-js">const x = 1;</code></pre>');
    await highlightCodeBlocks(container);
    const firstCode = container.querySelector('code');
    if (!firstCode) throw new Error('expected code block');
    const first = firstCode.innerHTML;

    const secondContainer = makeContainer('<pre><code class="language-js">const x = 1;</code></pre>');
    await highlightCodeBlocks(secondContainer);
    const secondCode = secondContainer.querySelector('code');
    if (!secondCode) throw new Error('expected code block');
    expect(secondCode.innerHTML).toBe(first);
  });
});
