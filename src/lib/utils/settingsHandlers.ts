import { syncThemeFromActiveTheme } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { showToast } from '$lib/stores/toastStore.svelte';
import { getActiveEditorView } from '$lib/utils/editorCommands';
import { spellcheckState } from '$lib/utils/spellcheck.svelte.ts';
import { invalidateSpellcheckCache, triggerImmediateLint } from '$lib/utils/spellcheckExtension.svelte.ts';

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
  syncThemeFromActiveTheme();
}
