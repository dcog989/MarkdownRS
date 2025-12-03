export type DialogResult = 'save' | 'discard' | 'cancel';

export type DialogOptions = {
    title: string;
    message: string;
    saveLabel?: string;
    discardLabel?: string;
    cancelLabel?: string;
};

class DialogStore {
    isOpen = $state(false);
    options = $state<DialogOptions>({ title: '', message: '' });
    resolvePromise: ((value: DialogResult) => void) | null = null;

    confirm(options: DialogOptions): Promise<DialogResult> {
        this.options = {
            saveLabel: 'Save',
            discardLabel: "Don't Save",
            cancelLabel: 'Cancel',
            ...options
        };
        this.isOpen = true;

        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }

    resolve(result: DialogResult) {
        this.isOpen = false;
        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }
    }
}

export const dialogStore = new DialogStore();
