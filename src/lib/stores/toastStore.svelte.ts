import { CONFIG } from '$lib/utils/config';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export type Toast = {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
};

let nextId = 0;
const TOAST_THROTTLE_MS = 3000;
const lastToastTimestamps = new Map<string, number>();

export const toastStore = $state<{ toasts: Toast[] }>({
  toasts: [],
});

export function showToast(type: ToastType, message: string, duration: number = CONFIG.UI.TOAST_DURATION_MS) {
  const key = `${type}:${message}`;
  const now = Date.now();
  const lastTime = lastToastTimestamps.get(key) || 0;
  if (now - lastTime < TOAST_THROTTLE_MS) return;
  lastToastTimestamps.set(key, now);

  const id = `toast-${nextId++}`;
  const toast: Toast = { id, message, type, duration };
  toastStore.toasts.push(toast);
}

export function dismissToast(id: string) {
  toastStore.toasts = toastStore.toasts.filter((t) => t.id !== id);
}
