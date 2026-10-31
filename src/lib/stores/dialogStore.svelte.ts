import { translate } from "$lib/i18n";

export type DialogResult = "save" | "discard" | "cancel";

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
  options: DialogOptions;
  resolve: (value: DialogResult) => void;
};

type PromptRequest = {
  options: PromptOptions;
  resolve: (value: string | null) => void;
};

// Module-level private state
const queue: DialogRequest[] = [];
const promptQueue: PromptRequest[] = [];

// Public reactive state
export const dialogStore = $state({
  isOpen: false,
  options: { title: "", message: "" } as DialogOptions,
  promptIsOpen: false,
  promptOptions: { title: "", value: "" } as PromptOptions,
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
    queue.push({
      options: {
        saveLabel: translate("common.save"),
        discardLabel: translate("common.discard"),
        cancelLabel: translate("common.cancel"),
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

function showNextPrompt() {
  const next = promptQueue[0];
  if (!next) {
    dialogStore.promptIsOpen = false;
    return;
  }

  dialogStore.promptOptions = next.options;
  dialogStore.promptIsOpen = true;
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    promptQueue.push({ options: { value: "", ...options }, resolve });
    if (!dialogStore.promptIsOpen) {
      showNextPrompt();
    }
  });
}

export function resolvePrompt(value: string | null) {
  const current = promptQueue.shift();
  current?.resolve(value);

  showNextPrompt();
}
