import { translate } from "$lib/i18n";
import { clearTabCaches } from "$lib/stores/editorCache";
import { editorStore, updateTabFields } from "$lib/stores/editorStore.svelte";
import { setTheme, settingsState } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { callBackend } from "$lib/utils/backend";
import { getActiveEditorView } from "$lib/utils/editorCommands";
import { forceMarkdownRelint } from "$lib/utils/markdownLintExtension.svelte";
import { extractSmartTitle, getBaseTitle } from "$lib/utils/smartTitle";
import { spellcheckState } from "$lib/utils/spellcheck.svelte";
import { invalidateSpellcheckCache, triggerImmediateLint } from "$lib/utils/spellcheckExtension.svelte";
import { BUILTIN_THEME_NAME, themeSupportsLight } from "$lib/utils/themes";

export function reloadSpellcheck() {
  spellcheckState.clear();
  invalidateSpellcheckCache();
  appContext.spellcheck.init(true).then((ready) => {
    if (ready === null) return;
    showToast(
      ready ? "success" : "error",
      translate(ready ? "settings.spellcheckSettingsUpdated" : "settings.spellcheckSettingsFailed"),
    );
    const activeView = getActiveEditorView();
    if (activeView) triggerImmediateLint(activeView);
  });
}

export function onHarperChanged() {
  const activeView = getActiveEditorView();
  if (activeView) forceMarkdownRelint(activeView);
}

export function onLogLevelChange(newValue: unknown) {
  void callBackend("set_log_level", { level: String(newValue) }, "Settings:Save", undefined, {
    ignore: true,
  });
  showToast("info", translate("settings.logLevelChanged"));
}

export function onThemeChange(newValue: unknown) {
  const themeName = String(newValue);
  if (themeName === BUILTIN_THEME_NAME) return;

  // A dark-only theme has no light palette: pin the mode so light chrome never
  // sits on top of dark theme variables. The mode select shows the change.
  const darkOnly = themeSupportsLight(themeName, settingsState.themeVariants) === false;
  if (darkOnly && settingsState.theme === "light") setTheme("dark");
}

export function onThemeModeChange(newValue: unknown) {
  if (newValue === "auto" || newValue === "dark" || newValue === "light") setTheme(newValue);
}

/** Re-derive every open tab's title when "tabs named from content" is toggled.
 *  Enabling renames from the first content line; disabling reverts file-backed
 *  tabs to their file name (custom-titled tabs are left untouched). */
export function onTabNameFromContentChange(newValue: unknown) {
  const enabled = !!newValue;
  for (const tab of editorStore.tabs) {
    if (tab.customTitle) continue;
    const targetTitle = enabled ? (extractSmartTitle(tab.content) ?? tab.title) : getBaseTitle(tab);
    if (tab.title !== targetTitle) {
      updateTabFields(tab.id, { title: targetTitle });
    }
  }
}

/** Turning off closed-tab history frees the stored buffers now; the next
 *  session save clears their persisted rows too. */
export function onClosedTabHistoryChange(newValue: unknown) {
  if (newValue) return;
  for (const entry of editorStore.closedTabsHistory) {
    clearTabCaches(entry.tab.id);
  }
  editorStore.closedTabsHistory = [];
  // Without this the persist below would skip (nothing else is dirty), leaving
  // the closed-tab text in session.db even though the setting is off.
  editorStore.sessionDirty = true;
}
