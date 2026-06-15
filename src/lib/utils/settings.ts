import { appState } from '$lib/stores/appState.svelte';
import { callBackendSafe } from './backend';
import { debounce } from './timing';

const SETTINGS_EXCLUDED_KEYS = new Set([
  'activeTabId',
  'isTabSwitching',
  'osPlatform',
  'availableThemes',
  'gfmEnabled',
  'writerMode',
]);

let lastSavedState: string = '';

function getSettingsObject(): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (const key in appState) {
    if (!SETTINGS_EXCLUDED_KEYS.has(key)) {
      settings[key] = (appState as Record<string, unknown>)[key];
    }
  }
  return settings;
}

export async function initSettings() {
  const [saved, appInfo] = await Promise.all([
    callBackendSafe('load_settings', {}, 'Settings:Load', {
      showToast: false,
      userMessage: 'Failed to load settings',
    }),
    callBackendSafe('get_app_info', {}, 'Settings:AppInfo', {
      showToast: false,
      userMessage: 'Failed to get app info',
    }),
  ]);

  if (appInfo?.os_platform) {
    appState.osPlatform = appInfo.os_platform as 'windows' | 'linux' | 'macos';
  }

  if (saved && Object.keys(saved).length > 0) {
    Object.keys(saved).forEach((key) => {
      if (Object.hasOwn(appState, key)) {
        (appState as Record<string, unknown>)[key] = saved[key];
      }
    });
  }

  // Keep theme in sync with activeTheme from saved settings
  appState.theme =
    appState.activeTheme === 'System'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : appState.activeTheme.toLowerCase().includes('light')
        ? 'light'
        : 'dark';

  lastSavedState = JSON.stringify(getSettingsObject());
}

async function saveSettingsImmediate() {
  const settingsToSave = getSettingsObject();
  const serialized = JSON.stringify(settingsToSave);

  if (serialized === lastSavedState) {
    return;
  }

  await callBackendSafe('save_settings', { settings: settingsToSave }, 'Settings:Save', {
    showToast: false,
    userMessage: 'Failed to save settings',
  });
  lastSavedState = serialized;
}

export const saveSettings = debounce(saveSettingsImmediate, 500);
export const saveSettingsNow = saveSettingsImmediate;
