import { info } from '@tauri-apps/plugin-log';

export const ENABLE_SCROLL_LOGGING = true;

export async function logScroll(source: 'Editor' | 'Preview', action: string, data?: Record<string, any>) {
    if (!ENABLE_SCROLL_LOGGING) return;

    const prefix = source === 'Editor' ? '[Editor]' : '[Preview]';
    let message = `${prefix} ${action}`;

    if (data) {
        const dataStr = Object.entries(data)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
        message += ` | ${dataStr}`;
    }

    // Write to the actual log file on disk (and console)
    await info(message);
}
