import { translate } from '$lib/i18n';
import { appState } from '$lib/stores/appState.svelte';
import { settingsState, syncThemeFromSystem } from '$lib/stores/settingsState.svelte';
import { callBackendSafe } from './backend';
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
      userMessage: translate('error.failedToLoadSettings'),
    }),
    callBackendSafe('get_app_info', {}, 'Settings:AppInfo', {
      showToast: false,
      userMessage: translate('error.failedToGetAppInfo'),
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

  const legacy = saved as Record<string, unknown> | null;
  if (legacy?.enableAutocomplete === false) {
    settingsState.autocompleteDelay = -1;
  }

  syncThemeFromSystem();

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
    userMessage: translate('error.failedToSaveSettings'),
  });
  lastSavedState = serialized;
}

export const saveSettings = debounce(saveSettingsImmediate, 500);
export const saveSettingsNow = saveSettingsImmediate;
