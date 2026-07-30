import { callBackendSafe } from './backend';

export const LEGACY_THEME_NAMES = ['default-dark', 'default-light'];

export const THEME_MODE: Record<string, 'dark' | 'light'> = {
  System: 'dark',
  'RS-Dark': 'dark',
  'RS-Light': 'light',
  Catppuccin: 'dark',
  Gruvbox: 'dark',
  'Tokyo Night': 'dark',
  'One Dark Pro': 'dark',
  GitHub: 'dark',
  Nord: 'dark',
  'High Contrast': 'dark',
  Dracula: 'dark',
  'Fern Forest': 'dark',
  'Pink Palace': 'dark',
  Newspaper: 'light',
};

export const DEFAULT_THEME_NAMES = Object.keys(THEME_MODE)
  .filter((t) => t !== 'System')
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

export function keyed(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function resolveThemeMode(activeTheme: string): 'dark' | 'light' {
  return THEME_MODE[activeTheme] ?? (activeTheme.toLowerCase().includes('light') ? 'light' : 'dark');
}

export async function getThemeCss(themeName: string): Promise<string> {
  const result = await callBackendSafe('get_theme_css', { themeName }, 'Settings:Load', {
    userMessage: `Failed to load theme '${themeName}'`,
  });
  return result ?? '';
}
