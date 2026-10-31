import { translate } from "$lib/i18n";
import { appState } from "$lib/stores/appState.svelte";
import { settingsState, syncThemeFromSystem } from "$lib/stores/settingsState.svelte";
import { callBackendSafe } from "./backend";
import { applyThemeCss } from "./themes";
import { debounce } from "./timing";

const SETTINGS_EXCLUDED_KEYS = new Set([
  "activeTabId",
  "isTabSwitching",
  "osPlatform",
  "availableThemes",
  "writerMode",
]);

// Runtime analytics are persisted, but changes to them alone never trigger a
// save. They ride along with the next settings save and are force-flushed on
// close (saveSettingsNow).
const SETTINGS_RUNTIME_KEYS = new Set(["commandUsage", "commandUsageCounts"]);

let lastSavedState: string = "";

function getSettingsObject(includeRuntime: boolean): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (const key in settingsState) {
    if (SETTINGS_EXCLUDED_KEYS.has(key)) continue;
    if (!includeRuntime && SETTINGS_RUNTIME_KEYS.has(key)) continue;
    settings[key] = (settingsState as Record<string, unknown>)[key];
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

  if (expected === "number") {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") {
      const num = Number(value);
      if (!Number.isNaN(num)) return num;
    }
    return fallback;
  }

  if (expected === "boolean") {
    return typeof value === "boolean" ? value : fallback;
  }

  if (expected === "string") {
    return typeof value === "string" ? value : fallback;
  }

  if (Array.isArray(fallback)) {
    return Array.isArray(value) ? value : fallback;
  }

  if (expected === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  }

  return fallback;
}

export async function initSettings() {
  const [saved, appInfo] = await Promise.all([
    callBackendSafe("load_settings", {}, "Settings:Load", {
      userMessage: translate("error.failedToLoadSettings"),
    }),
    callBackendSafe("get_app_info", {}, "Settings:AppInfo", {
      showToast: false,
      userMessage: translate("error.failedToGetAppInfo"),
    }),
  ]);

  if (appInfo?.os_platform) {
    appState.osPlatform = appInfo.os_platform as "windows" | "linux" | "macos";
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
  if (legacy && !Object.hasOwn(legacy, "statusBarOpacity")) {
    if (typeof legacy.statusBarTransparency === "number") {
      settingsState.statusBarOpacity = 100 - legacy.statusBarTransparency;
    }
  }
  if (legacy && !Object.hasOwn(legacy, "findPanelOpacity")) {
    if (typeof legacy.findPanelTransparency === "number") {
      settingsState.findPanelOpacity = 100 - legacy.findPanelTransparency;
    } else if (legacy.findPanelTransparent === true) {
      settingsState.findPanelOpacity = 15;
    }
  }

  // Delivered with the settings so the first frame is already themed.
  const startupThemeCss = legacy?.themeCss;
  if (typeof startupThemeCss === "string" && startupThemeCss) {
    applyThemeCss(settingsState.activeTheme, startupThemeCss);
  }

  syncThemeFromSystem();

  lastSavedState = JSON.stringify(getSettingsObject(false));
}

// Writes run one at a time so a slower, older snapshot cannot finish last.
let saveInFlight: Promise<void> = Promise.resolve();

async function writeSettings(): Promise<void> {
  const settingsToSave = getSettingsObject(true);
  const serialized = JSON.stringify(settingsToSave);

  if (serialized === lastSavedState) {
    return;
  }

  let failed = false;
  await callBackendSafe("save_settings", { settings: settingsToSave }, "Settings:Save", {
    showToast: false,
    userMessage: translate("error.failedToSaveSettings"),
    onError: () => {
      failed = true;
    },
  });
  // A failed write must stay unsaved so the next save retries it. The command
  // returns nothing, so null means both success and failure; the error callback
  // is the only signal.
  if (!failed) {
    lastSavedState = serialized;
  }
}

function saveSettingsImmediate(): Promise<void> {
  const next = saveInFlight.then(writeSettings);
  // Keep the queue usable even if a write rejects.
  saveInFlight = next.catch(() => {});
  return next;
}

// Persists settings. Runtime analytics (command usage) never trigger a write
// on their own; they ride along whenever another change writes the file.
export const saveSettings = debounce(saveSettingsImmediate, 500);

export function saveSettingsNow(): Promise<void> {
  (saveSettings as { clear?: () => void }).clear?.();
  return saveSettingsImmediate();
}
