import { pushToMru } from '$lib/stores/editorLifecycle';
import { appContext } from '$lib/stores/state.svelte';
import { CONFIG } from '$lib/utils/config';

export function createMruCycling() {
  let showPopup = $state(false);
  let selectedIndex = $state(0);
  let isCycling = $state(false);
  let timer: number | null = null;

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      if (!isCycling) {
        isCycling = true;
        selectedIndex = appContext.editor.mruStack.length > 1 ? 1 : 0;
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => {
          showPopup = true;
        }, CONFIG.UI_TIMING.MRU_POPUP_DELAY_MS);
      } else {
        selectedIndex = (selectedIndex + 1) % appContext.editor.mruStack.length;
        showPopup = true;
        if (timer) clearTimeout(timer);
      }
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Control' || !e.ctrlKey) {
      if (isCycling) {
        if (timer) clearTimeout(timer);
        const targetId = appContext.editor.mruStack[selectedIndex];
        if (targetId) {
          appContext.app.activeTabId = targetId;
          pushToMru(targetId);
        }
        isCycling = false;
        showPopup = false;
      }
    }
  }

  function cleanup() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    get showPopup() {
      return showPopup;
    },
    set showPopup(v: boolean) {
      showPopup = v;
    },
    get selectedIndex() {
      return selectedIndex;
    },
    get isCycling() {
      return isCycling;
    },
    onKeyDown,
    onKeyUp,
    cleanup,
  };
}
