export type DialogResult = 'save' | 'discard' | 'cancel';

export type DialogOptions = {
  title: string;
  message: string;
  saveLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
};

export type PromptOptions = {
  title: string;
  message?: string;
  value?: string;
};

type DialogRequest = {
  id: string;
  options: DialogOptions;
  resolve: (value: DialogResult) => void;
};

// Module-level private state
const queue: DialogRequest[] = [];
let idCounter = 0;

// Public reactive state
export const dialogStore = $state({
  isOpen: false,
  options: { title: '', message: '' } as DialogOptions,
  promptIsOpen: false,
  promptOptions: { title: '', value: '' } as PromptOptions,
  promptResolve: null as ((value: string | null) => void) | null,
});

function showNext() {
  if (queue.length === 0) {
    dialogStore.isOpen = false;
    return;
  }

  const next = queue[0];
  dialogStore.options = next.options;
  dialogStore.isOpen = true;
}

export function confirmDialog(options: DialogOptions): Promise<DialogResult> {
  return new Promise((resolve) => {
    const id = `dialog-${++idCounter}`;
    queue.push({
      id,
      options: {
        saveLabel: 'Save',
        discardLabel: 'Discard',
        cancelLabel: 'Cancel',
        ...options,
      },
      resolve,
    });

    if (!dialogStore.isOpen) {
      showNext();
    }
  });
}

export function resolveDialog(result: DialogResult) {
  if (queue.length === 0) {
    return;
  }

  const current = queue.shift();
  if (current) {
    current.resolve(result);
  }

  showNext();
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    dialogStore.promptOptions = { value: '', ...options };
    dialogStore.promptResolve = resolve;
    dialogStore.promptIsOpen = true;
  });
}

export function resolvePrompt(value: string | null) {
  dialogStore.promptResolve?.(value);
  dialogStore.promptResolve = null;
  dialogStore.promptIsOpen = false;
}
