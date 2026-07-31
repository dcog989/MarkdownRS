import { translate } from '$lib/i18n';
import { callBackendSafe } from './backend';

export const LEGACY_THEME_NAMES = ['default-dark', 'default-light', 'rs-dark', 'rs-light'];

export const DEFAULT_THEME_NAMES = [
  'Catppuccin',
  'Dracula',
  'Fern Forest',
  'GitHub',
  'Gruvbox',
  'High Contrast',
  'Newspaper',
  'Nord',
  'One Dark Pro',
  'Pink Palace',
  'Solarized',
  'Default Dark',
  'Default Light',
  'Tokyo Night',
].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

export function keyed(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

const MODE_FOLLOWING_THEMES = new Set(['GitHub', 'High Contrast', 'Newspaper', 'Solarized']);

export function isModeFollowingTheme(name: string): boolean {
  return MODE_FOLLOWING_THEMES.has(name);
}

export async function getThemeCss(themeName: string): Promise<string> {
  const result = await callBackendSafe('get_theme_css', { themeName }, 'Settings:Load', {
    userMessage: translate('error.failedToLoadTheme', { values: { theme: themeName } }),
  });
  return result ?? '';
}
