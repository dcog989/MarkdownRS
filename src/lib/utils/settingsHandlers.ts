import { syncThemeFromSystem } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { getActiveEditorView } from '$lib/utils/editorCommands';
import { spellcheckState } from '$lib/utils/spellcheck.svelte';
import { invalidateSpellcheckCache, triggerImmediateLint } from '$lib/utils/spellcheckExtension.svelte';

export function reloadSpellcheck() {
  spellcheckState.clear();
  invalidateSpellcheckCache();
  appContext.spellcheck.init(true).then(() => {
    showToast('success', 'Spellcheck settings updated');
    const activeView = getActiveEditorView();
    if (activeView) triggerImmediateLint(activeView);
  });
}

export function onLogLevelChange() {
  showToast('info', 'Restart required to apply log level changes');
}

export function onThemeChange() {
  const { activeTheme } = appContext.settings;
  if (activeTheme === 'System') {
    syncThemeFromSystem();
  } else if (activeTheme === 'Default Light') {
    appContext.settings.theme = 'light';
  } else if (activeTheme === 'Default Dark') {
    appContext.settings.theme = 'dark';
  }
}
