export type DialogOptions = {
    title: string;
    message: string;
    okLabel?: string;
    cancelLabel?: string;
};

class DialogStore {
    isOpen = $state(false);
    options = $state<DialogOptions>({ title: '', message: '' });
    resolvePromise: ((value: boolean) => void) | null = null;

    confirm(options: DialogOptions): Promise<boolean> {
        this.options = {
            okLabel: 'Yes',
            cancelLabel: 'Cancel',
            ...options
        };
        this.isOpen = true;

        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }

    resolve(result: boolean) {
        this.isOpen = false;
        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }
    }
}

export const dialogStore = new DialogStore();
