import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMermaidCache, renderMermaidDiagrams } from './mermaidRenderer';

const renderMock = vi.fn();
const initializeMock = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initializeMock(...args),
    render: (...args: unknown[]) => renderMock(...args),
  },
}));

describe('renderMermaidDiagrams', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    clearMermaidCache();
    renderMock.mockReset();
    initializeMock.mockReset();
    renderMock.mockResolvedValue({ svg: '<svg id="diagram"></svg>' });
  });

  it('renders mermaid blocks into .mermaid-container divs and initializes with the light theme', async () => {
    container.innerHTML = '<pre><code class="language-mermaid">graph TD\nA-->B</code></pre>';

    await renderMermaidDiagrams(container);

    const diagrams = container.querySelectorAll('.mermaid-container');
    expect(diagrams).toHaveLength(1);
    expect(diagrams[0].innerHTML).toBe('<svg id="diagram"></svg>');
    expect(container.querySelector('pre')).toBeNull();
    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false, theme: 'default' }));
  });

  it('does not load mermaid when no blocks are present', async () => {
    container.innerHTML = '<p>Hello</p><pre><code class="language-js">const x = 1;</code></pre>';

    await renderMermaidDiagrams(container);

    expect(renderMock).not.toHaveBeenCalled();
    expect(initializeMock).not.toHaveBeenCalled();
  });

  it('caches renders by source hash', async () => {
    container.innerHTML = [
      '<pre><code class="language-mermaid">graph TD\nA-->B</code></pre>',
      '<pre><code class="language-mermaid">graph TD\nA-->B</code></pre>',
    ].join('');

    await renderMermaidDiagrams(container);

    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.mermaid-container')).toHaveLength(2);
  });

  it('uses the dark theme when data-theme is dark', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    container.innerHTML = '<pre><code class="language-mermaid">graph TD</code></pre>';

    await renderMermaidDiagrams(container);

    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('replaces failed blocks with an error fallback', async () => {
    renderMock.mockRejectedValue(new Error('Syntax error in diagram'));
    container.innerHTML = '<pre><code class="language-mermaid">not a diagram</code></pre>';

    await renderMermaidDiagrams(container);

    const error = container.querySelector('.mermaid-error');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('Syntax error in diagram');
    expect(container.querySelector('.mermaid-container:not(.mermaid-error)')).toBeNull();
  });

  it('skips blocks that are no longer connected to the DOM', async () => {
    container.innerHTML = '<pre><code class="language-mermaid">graph TD</code></pre>';
    const block = container.querySelector('pre');

    const promise = renderMermaidDiagrams(container);
    block?.remove();
    await promise;

    expect(renderMock).not.toHaveBeenCalled();
    expect(container.querySelector('.mermaid-container')).toBeNull();
    expect(container.querySelector('.mermaid-error')).toBeNull();
  });
});
