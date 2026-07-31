import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { confirmDialog, resolveDialog } from '$lib/stores/dialogStore.svelte';
import ConfirmationModal from './ConfirmationModal.svelte';

describe('ConfirmationModal', () => {
  it('renders the queued dialog options and resolves on a button click', async () => {
    const promise = confirmDialog({
      title: 'Unsaved changes',
      message: 'Save before closing?',
      saveLabel: 'Save',
      discardLabel: 'Discard',
      cancelLabel: 'Cancel',
    });
    render(ConfirmationModal);

    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByText('Save before closing?')).toBeTruthy();

    await fireEvent.click(screen.getByText('Discard'));

    await expect(promise).resolves.toBe('discard');
    expect(screen.queryByText('Save before closing?')).toBeNull();
  });

  it('resolves cancel when the backdrop is clicked', async () => {
    const promise = confirmDialog({
      title: 'Keep changes?',
      message: 'body',
      saveLabel: 'Save',
      discardLabel: 'Discard',
    });
    render(ConfirmationModal);

    await fireEvent.click(screen.getByLabelText('Close modal'));

    await expect(promise).resolves.toBe('cancel');
  });

  it('resolves cancel when Escape is pressed', async () => {
    const promise = confirmDialog({
      title: 'Keep changes?',
      message: 'body',
      saveLabel: 'Save',
      discardLabel: 'Discard',
    });
    render(ConfirmationModal);

    await fireEvent.keyDown(screen.getByLabelText('Close modal'), { key: 'Escape' });

    await expect(promise).resolves.toBe('cancel');
  });

  it('applies the default labels for omitted buttons', async () => {
    const promise = confirmDialog({ title: 'Confirm', message: 'Really?', discardLabel: 'Discard' });
    render(ConfirmationModal);

    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Discard')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();

    resolveDialog('discard');
    await expect(promise).resolves.toBe('discard');
  });
});
