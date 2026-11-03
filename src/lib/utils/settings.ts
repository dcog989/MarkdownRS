import { type AppLocale, SUPPORTED_LOCALES, SYSTEM_LOCALE, translate } from "$lib/i18n";
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
  "themeVariants",
  "systemAccentColor",
  "writerMode",
]);

// Runtime analytics are persisted, but changes to them alone never trigger a
// save. They ride along with the next settings save and are force-flushed on
// close (saveSettingsNow).
const SETTINGS_RUNTIME_KEYS = new Set(["commandUsage", "commandUsageCounts"]);

let lastSavedState: string = "";
// Includes the runtime keys, so close-time force saves stay a no-op when
// nothing changed since the last write.
let lastSavedFullState: string = "";

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
export function coerceSettingValue(value: unknown, fallback: unknown): unknown {
  const expected = typeof fallback;

  if (expected === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value === "string" && value.trim() !== "") {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
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

const MIN_OPACITY = 0;
const MAX_OPACITY = 100;
const LEGACY_TRANSPARENT_FIND_PANEL_OPACITY = 15;

function clampOpacity(value: number): number {
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
}

/**
 * Applies settings written by older versions to `target`. Transparency used to
 * be stored where opacity is now stored, so older files need the inverse
 * conversion. Exposed for tests; `initSettings` is the only caller.
 */
export function applyLegacySettingMappings(saved: Record<string, unknown>, target: Record<string, unknown>): void {
  if (saved.enableAutocomplete === false) {
    target.autocompleteDelay = -1;
  }
  if (!Object.hasOwn(saved, "statusBarOpacity") && typeof saved.statusBarTransparency === "number") {
    target.statusBarOpacity = clampOpacity(100 - saved.statusBarTransparency);
  }
  if (!Object.hasOwn(saved, "findPanelOpacity")) {
    if (typeof saved.findPanelTransparency === "number") {
      target.findPanelOpacity = clampOpacity(100 - saved.findPanelTransparency);
    } else if (saved.findPanelTransparent === true) {
      target.findPanelOpacity = LEGACY_TRANSPARENT_FIND_PANEL_OPACITY;
    }
  }
}

/** Returns false when the file could not be read, so callers must not write the
 *  defaults back over it. A missing file is a successful load and yields `{}`. */
export async function initSettings(): Promise<boolean> {
  const [saved, appInfo, systemAccent] = await Promise.all([
    callBackendSafe("load_settings", {}, "Settings:Load", {
      userMessage: translate("error.failedToLoadSettings"),
    }),
    callBackendSafe("get_app_info", {}, "Settings:AppInfo", {
      showToast: false,
      userMessage: translate("error.failedToGetAppInfo"),
    }),
    callBackendSafe("get_system_accent_color", {}, "Settings:Load", {
      showToast: false,
      userMessage: translate("error.failedToLoadSettings"),
    }),
  ]);

  if (systemAccent) {
    settingsState.systemAccentColor = systemAccent;
  }

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

  if (settingsState.locale !== SYSTEM_LOCALE && !SUPPORTED_LOCALES.includes(settingsState.locale as AppLocale)) {
    settingsState.locale = SYSTEM_LOCALE;
  }

  const legacy = saved as Record<string, unknown> | null;
  if (legacy) {
    applyLegacySettingMappings(legacy, settingsState as unknown as Record<string, unknown>);
  }

  // Delivered with the settings so the first frame is already themed.
  const startupThemeCss = legacy?.themeCss;
  if (typeof startupThemeCss === "string" && startupThemeCss) {
    applyThemeCss(settingsState.activeTheme, startupThemeCss);
  }

  syncThemeFromSystem();

  lastSavedState = JSON.stringify(getSettingsObject(false));
  lastSavedFullState = JSON.stringify(getSettingsObject(true));
  return saved !== null;
}

// Writes run one at a time so a slower, older snapshot cannot finish last.
let saveInFlight: Promise<void> = Promise.resolve();

async function writeSettings(force = false): Promise<void> {
  const settingsToSave = getSettingsObject(true);
  const serialized = JSON.stringify(settingsToSave);
  const comparable = JSON.stringify(getSettingsObject(false));

  // Runtime analytics alone never trigger a write; a forced save (close) still
  // skips the write when nothing at all changed since the last one.
  if (force ? serialized === lastSavedFullState : comparable === lastSavedState) {
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
    lastSavedState = comparable;
    lastSavedFullState = serialized;
  }
}

function saveSettingsImmediate(force = false): Promise<void> {
  const next = saveInFlight.then(() => writeSettings(force));
  // Keep the queue usable even if a write rejects.
  saveInFlight = next.catch(() => {});
  return next;
}

// Persists settings. Runtime analytics (command usage) never trigger a write
// on their own; they ride along whenever another change writes the file.
export const saveSettings = debounce(saveSettingsImmediate, 500);

export function saveSettingsNow(): Promise<void> {
  (saveSettings as { clear?: () => void }).clear?.();
  return saveSettingsImmediate(true);
}
