import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { EditorTab } from '$lib/stores/editorTypes';
import TabButton from './TabButton.svelte';

function tab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: 't1',
    title: 'README.md',
    content: '',
    lastSavedHash: '',
    isDirty: false,
    path: '/root/README.md',
    sizeBytes: 100,
    wordCount: 0,
    lineCount: 1,
    widestColumn: 0,
    cursor: { anchor: 0, head: 0 },
    lineEnding: 'LF',
    encoding: 'UTF-8',
    hasBom: false,
    ...overrides,
  };
}

describe('TabButton', () => {
  it('renders the title and calls onclick with the tab id', async () => {
    const onclick = vi.fn();
    render(TabButton, { tab: tab(), isActive: true, onclick });

    await fireEvent.click(screen.getByText('README.md'));

    expect(onclick).toHaveBeenCalledWith('t1');
  });

  it('prefers the custom title when present', () => {
    render(TabButton, { tab: tab({ customTitle: 'My Doc' }), isActive: false });

    expect(screen.getByText('My Doc')).toBeTruthy();
    expect(screen.queryByText('README.md')).toBeNull();
  });

  it('fires onclose with the event and tab id, stopping propagation', async () => {
    const onclose = vi.fn();
    render(TabButton, { tab: tab(), isActive: false, onclose });

    await fireEvent.click(screen.getByLabelText('Close README.md'));

    expect(onclose).toHaveBeenCalledTimes(1);
    const [event, id] = onclose.mock.calls[0];
    expect(id).toBe('t1');
    expect(event.defaultPrevented).toBe(false);
  });

  it('fires oncontextmenu with the event and tab id, preventing default', async () => {
    const oncontextmenu = vi.fn();
    render(TabButton, { tab: tab(), isActive: false, oncontextmenu });

    await fireEvent.contextMenu(screen.getByText('README.md'));

    expect(oncontextmenu).toHaveBeenCalledTimes(1);
    const [event, id] = oncontextmenu.mock.calls[0];
    expect(id).toBe('t1');
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows a missing-file warning indicator for failed file checks', () => {
    const { container } = render(TabButton, { tab: tab({ fileCheckFailed: true }), isActive: false });

    expect(container.querySelector('.lucide-circle-alert')).not.toBeNull();
  });
});
