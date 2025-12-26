export type DialogResult = 'save' | 'discard' | 'cancel';

export type DialogOptions = {
    title: string;
    message: string;
    saveLabel?: string;
    discardLabel?: string;
    cancelLabel?: string;
};

type DialogRequest = {
    options: DialogOptions;
    resolve: (value: DialogResult) => void;
};

class DialogStore {
    isOpen = $state(false);
    options = $state<DialogOptions>({ title: '', message: '' });

    private queue: DialogRequest[] = [];

    confirm(options: DialogOptions): Promise<DialogResult> {
        return new Promise((resolve) => {
            this.queue.push({
                options: {
                    saveLabel: 'Save',
                    discardLabel: "Don't Save",
                    cancelLabel: 'Cancel',
                    ...options
                },
                resolve
            });

            if (!this.isOpen) {
                this.showNext();
            }
        });
    }

    private showNext() {
        if (this.queue.length === 0) {
            this.isOpen = false;
            return;
        }

        const next = this.queue[0];
        this.options = next.options;
        this.isOpen = true;
    }

    resolve(result: DialogResult) {
        const current = this.queue.shift();
        if (current) {
            current.resolve(result);
        }
        this.showNext();
    }
}

export const dialogStore = new DialogStore();
