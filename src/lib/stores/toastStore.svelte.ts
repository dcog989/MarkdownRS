export type ToastType = 'info' | 'success' | 'warning' | 'error';

export type Toast = {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
};

class ToastStore {
    toasts = $state<Toast[]>([]);
    private nextId = 0;

    show(message: string, type: ToastType = 'info', duration: number = 3000) {
        const id = `toast-${this.nextId++}`;
        const toast: Toast = { id, message, type, duration };
        
        this.toasts.push(toast);
        
        if (duration > 0) {
            setTimeout(() => {
                this.dismiss(id);
            }, duration);
        }
    }

    dismiss(id: string) {
        this.toasts = this.toasts.filter(t => t.id !== id);
    }

    info(message: string, duration?: number) {
        this.show(message, 'info', duration);
    }

    success(message: string, duration?: number) {
        this.show(message, 'success', duration);
    }

    warning(message: string, duration?: number) {
        this.show(message, 'warning', duration);
    }

    error(message: string, duration?: number) {
        this.show(message, 'error', duration);
    }
}

export const toastStore = new ToastStore();
