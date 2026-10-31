import { CONFIG } from "$lib/utils/config";

export type ToastType = "info" | "success" | "warning" | "error";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type Toast = {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  action?: ToastAction;
};

let nextId = 0;
const TOAST_THROTTLE_MS = 3000;
const lastToastTimestamps = new Map<string, number>();

export const toastStore = $state<{ toasts: Toast[] }>({
  toasts: [],
});

export function showToast(
  type: ToastType,
  message: string,
  duration: number = CONFIG.UI.TOAST_DURATION_MS,
  action?: ToastAction,
) {
  const now = Date.now();

  // Drop entries from earlier windows so the throttle map cannot grow with
  // every distinct message over a long session.
  for (const [key, timestamp] of lastToastTimestamps) {
    if (now - timestamp >= TOAST_THROTTLE_MS) lastToastTimestamps.delete(key);
  }

  // Errors are never throttled: two different failures often share the same
  // translated text, and hiding the second one hides a real problem.
  if (type !== "error") {
    const key = `${type}:${message}`;
    if (now - (lastToastTimestamps.get(key) ?? 0) < TOAST_THROTTLE_MS) return;
    lastToastTimestamps.set(key, now);
  }

  const id = `toast-${nextId++}`;
  const toast: Toast = { id, message, type, duration, action };
  toastStore.toasts.push(toast);
}

export function dismissToast(id: string) {
  toastStore.toasts = toastStore.toasts.filter((t) => t.id !== id);
}
