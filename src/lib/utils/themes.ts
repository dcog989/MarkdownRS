import { callBackendSafe } from './backend';

export const DEFAULT_THEME_NAMES = ['default-dark', 'default-light'];

export async function getThemeCss(themeName: string): Promise<string> {
    const result = await callBackendSafe('get_theme_css', { themeName }, 'Settings:Load', {
        userMessage: `Failed to load theme '${themeName}'`,
    });
    return result ?? '';
}
