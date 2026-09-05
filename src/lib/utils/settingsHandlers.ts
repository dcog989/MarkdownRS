import { translate } from "$lib/i18n";
import { editorStore, updateTabFields } from "$lib/stores/editorStore.svelte";
import { settingsState, syncThemeFromSystem } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { callBackend } from "$lib/utils/backend";
import { getActiveEditorView } from "$lib/utils/editorCommands";
import { forceMarkdownRelint } from "$lib/utils/markdownLintExtension.svelte";
import { extractSmartTitle, getBaseTitle } from "$lib/utils/smartTitle";
import { spellcheckState } from "$lib/utils/spellcheck.svelte";
import { invalidateSpellcheckCache, triggerImmediateLint } from "$lib/utils/spellcheckExtension.svelte";

export function reloadSpellcheck() {
  spellcheckState.clear();
  invalidateSpellcheckCache();
  appContext.spellcheck.init(true).then(() => {
    showToast("success", translate("settings.spellcheckSettingsUpdated"));
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
  if (newValue === "System") {
    settingsState.themeMode = "auto";
  }
  syncThemeFromSystem();
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
