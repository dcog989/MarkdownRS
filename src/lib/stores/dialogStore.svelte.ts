export type DialogResult = 'save' | 'discard' | 'cancel';

export type DialogOptions = {
    title: string;
    message: string;
    saveLabel?: string;
    discardLabel?: string;
    cancelLabel?: string;
};

type DialogRequest = {
    id: string;
    options: DialogOptions;
    resolve: (value: DialogResult) => void;
};

// Module-level private state
let queue: DialogRequest[] = [];
let idCounter = 0;

// Public reactive state
export const dialogStore = $state({
    isOpen: false,
    options: { title: '', message: '' } as DialogOptions,
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
                discardLabel: "Don't Save",
                cancelLabel: 'Cancel',
                ...options
            },
            resolve
        });

        if (!dialogStore.isOpen) {
            showNext();
        }
    });
}


export function resolveDialog(result: DialogResult) {
    if (queue.length === 0) {
        console.warn('resolveDialog() called with empty queue');
        return;
    }

    const current = queue.shift();
    if (current) {
        current.resolve(result);
    }

    showNext();
}
