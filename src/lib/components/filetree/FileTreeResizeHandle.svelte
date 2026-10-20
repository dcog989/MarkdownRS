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
    // Any movement is a resize, even a 1px one: a "click" is only a press and
    // release without motion. Otherwise a tiny drag collapses the panel.
    if (ev.clientX !== startX) didDrag = true;
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

// The divider is a splitter: arrows resize it, and Enter is deliberately not
// bound. Enter belongs to the focused tree row (open/expand), and collapsing
// the panel from the splitter would unmount the focused element.
function handleKeydown(e: KeyboardEvent) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  const delta = e.key === "ArrowLeft" ? -CONFIG.FILETREE.RESIZE_STEP_PX : CONFIG.FILETREE.RESIZE_STEP_PX;
  appContext.settings.fileTreeWidth = Math.max(
    CONFIG.FILETREE.MIN_WIDTH,
    Math.min(CONFIG.FILETREE.MAX_WIDTH, appContext.settings.fileTreeWidth + delta),
  );
  saveSettings();
}
</script>

<!-- A focusable separator is the ARIA window-splitter pattern; the a11y rule can't tell. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  role="separator"
  aria-orientation="vertical"
  aria-label={$_("fileTree.resizeAria")}
  aria-valuenow={appContext.settings.fileTreeWidth}
  aria-valuemin={CONFIG.FILETREE.MIN_WIDTH}
  aria-valuemax={CONFIG.FILETREE.MAX_WIDTH}
  tabindex="0"
  class="ft-resize-handle"
  class:ft-resize-hover={hovered}
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
  onmousedown={startResize}
  onkeydown={handleKeydown}
  onclick={handleResizeClick}
></div>

<style>
.ft-resize-handle {
  position: absolute;
  top: 0;
  right: -7px;
  bottom: 0;
  width: 14px;
  cursor: col-resize;
  z-index: 30;
}

/* The visual line stays 6px on the panel edge; the 14px hit area is centered
   on the border (7px each side) so it grabs equally from either side. */
.ft-resize-handle::after {
  content: "";
  position: absolute;
  top: 0;
  right: 7px;
  bottom: 0;
  width: 6px;
  transition: background-color 150ms ease-out;
}

.ft-resize-handle.ft-resize-hover::after {
  background-color: var(--accent-primary);
  transition-delay: 250ms;
}

.ft-resize-handle:focus-visible::after {
  background-color: var(--accent-primary);
}
</style>
