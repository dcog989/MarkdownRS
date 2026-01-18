import { info } from '@tauri-apps/plugin-log';
import { throttle } from './timing';

// Use Vite's environment variable to strip logging in production
const ENABLE_SCROLL_LOGGING = import.meta.env.DEV;

// Throttled logger to prevent flooding the backend channel
// Limits logs to approx 10 per second
const logToBackend = throttle((message: string) => {
    // Fire and forget - errors here shouldn't stop the app
    info(message).catch(() => {});
}, 100);

export function logScroll(
    source: 'Editor' | 'Preview',
    action: string,
    data?: Record<string, unknown>,
) {
    // Immediate return in production - allows for dead code elimination/optimization
    if (!ENABLE_SCROLL_LOGGING) return;

    const prefix = source === 'Editor' ? '[Editor]' : '[Preview]';
    let message = `${prefix} ${action}`;

    // Expensive string construction only happens if logging is actually enabled
    if (data) {
        const dataStr = Object.entries(data)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
        message += ` | ${dataStr}`;
    }

    logToBackend(message);
}
