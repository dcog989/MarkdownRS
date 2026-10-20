<script lang="ts">
import { _ } from "svelte-i18n";
import { toggleFileTree } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { CONFIG } from "$lib/utils/config";
import { saveSettings } from "$lib/utils/settings";

let didDrag = false;
let hovered = $state(false);

function startResize(e: MouseEvent) {
  e.preventDefault();
  didDrag = false;
  const startX = e.clientX;
  const startWidth = appContext.settings.fileTreeWidth;

  const onMove = (ev: MouseEvent) => {
    if (Math.abs(ev.clientX - startX) > 3) {
      didDrag = true;
    }
    const newWidth = startWidth + (ev.clientX - startX);
    appContext.settings.fileTreeWidth = Math.max(
      CONFIG.FILETREE.MIN_WIDTH,
      Math.min(CONFIG.FILETREE.MAX_WIDTH, newWidth),
    );
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    document.body.style.cursor = "";
    if (didDrag) saveSettings();
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  document.body.style.cursor = "col-resize";
}

function handleResizeClick() {
  if (didDrag) return;
  toggleFileTree();
  saveSettings();
}
</script>

<div
  role="button"
  tabindex="0"
  aria-label={$_("fileTree.resizeAria")}
  class="ft-resize-handle"
  class:ft-resize-hover={hovered}
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
  onmousedown={startResize}
  onkeydown={() => {}}
  onclick={handleResizeClick}
  ondblclick={() => {
    appContext.settings.fileTreeWidth = CONFIG.FILETREE.DEFAULT_WIDTH;
    saveSettings();
  }}
></div>

<style>
.ft-resize-handle {
  position: absolute;
  top: 2rem;
  right: -4px;
  bottom: 0;
  width: 14px;
  cursor: col-resize;
  z-index: 30;
}

/* The visual line stays 6px on the panel edge; the rest is hit area. */
.ft-resize-handle::after {
  content: "";
  position: absolute;
  top: 0;
  right: 4px;
  bottom: 0;
  width: 6px;
  transition: background-color 150ms ease-out;
}

.ft-resize-handle.ft-resize-hover::after {
  background-color: var(--accent-primary);
  transition-delay: 250ms;
}
</style>
