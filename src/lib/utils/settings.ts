import { appState } from '$lib/stores/appState.svelte';
import { settingsState, syncThemeFromSystem } from '$lib/stores/settingsState.svelte';
import { callBackendSafe } from './backend';
import { isModeFollowingTheme } from './themes';
import { debounce } from './timing';

const SETTINGS_EXCLUDED_KEYS = new Set([
  'activeTabId',
  'isTabSwitching',
  'osPlatform',
  'availableThemes',
  'writerMode',
]);

let lastSavedState: string = '';

function getSettingsObject(): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (const key in settingsState) {
    if (!SETTINGS_EXCLUDED_KEYS.has(key)) {
      settings[key] = (settingsState as Record<string, unknown>)[key];
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
      if (Object.hasOwn(settingsState, key)) {
        (settingsState as Record<string, unknown>)[key] = saved[key];
      }
    });
  }

  if (settingsState.activeTheme === 'System' || isModeFollowingTheme(settingsState.activeTheme)) {
    syncThemeFromSystem();
  } else if (settingsState.activeTheme === 'Default Light') {
    settingsState.theme = 'light';
  }

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
