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
  'commandUsage',
  'commandUsageCounts',
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

/**
 * Validates a value loaded from settings.toml against the expected type of the
 * runtime default. Wrong types are coerced when safely possible (numeric
 * strings) or replaced with the default, so a hand-edited file with a bad value
 * can never flow an invalid type into the state and break consumers.
 */
function coerceSettingValue(value: unknown, fallback: unknown): unknown {
  const expected = typeof fallback;

  if (expected === 'number') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const num = Number(value);
      if (!Number.isNaN(num)) return num;
    }
    return fallback;
  }

  if (expected === 'boolean') {
    return typeof value === 'boolean' ? value : fallback;
  }

  if (expected === 'string') {
    return typeof value === 'string' ? value : fallback;
  }

  if (Array.isArray(fallback)) {
    return Array.isArray(value) ? value : fallback;
  }

  if (expected === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  }

  return fallback;
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
      if (!SETTINGS_EXCLUDED_KEYS.has(key) && Object.hasOwn(settingsState, key)) {
        (settingsState as Record<string, unknown>)[key] = coerceSettingValue(
          saved[key],
          (settingsState as Record<string, unknown>)[key],
        );
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
