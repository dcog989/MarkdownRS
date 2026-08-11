import { translate } from '$lib/i18n';
import { settingsState, syncThemeFromSystem } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { getActiveEditorView } from '$lib/utils/editorCommands';
import { spellcheckState } from '$lib/utils/spellcheck.svelte';
import { invalidateSpellcheckCache, triggerImmediateLint } from '$lib/utils/spellcheckExtension.svelte';

export function reloadSpellcheck() {
  spellcheckState.clear();
  invalidateSpellcheckCache();
  appContext.spellcheck.init(true).then(() => {
    showToast('success', translate('settings.spellcheckSettingsUpdated'));
    const activeView = getActiveEditorView();
    if (activeView) triggerImmediateLint(activeView);
  });
}

export function onLogLevelChange() {
  showToast('info', translate('settings.logLevelChanged'));
}

export function onThemeChange(newValue: unknown) {
  if (newValue === 'System') {
    settingsState.themeMode = 'auto';
  }
  syncThemeFromSystem();
}
