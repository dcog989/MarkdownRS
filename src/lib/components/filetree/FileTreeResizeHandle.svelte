<script lang="ts">
import { ChevronLeft } from 'lucide-svelte';
import { _ } from 'svelte-i18n';
import { toggleFileTree } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { CONFIG } from '$lib/utils/config';
import { saveSettings } from '$lib/utils/settings';

let isResizing = $state(false);
let didDrag = false;
let hovered = $state(false);

function startResize(e: MouseEvent) {
  e.preventDefault();
  isResizing = true;
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
    isResizing = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    if (didDrag) saveSettings();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
}

function handleResizeClick() {
  if (didDrag) return;
  toggleFileTree();
}
</script>

<div
  role="button"
  tabindex="0"
  aria-label={$_('fileTree.resizeAria')}
  class="ft-resize-handle"
  class:cursor-col-resize={isResizing}
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
>
  <span class="ft-collapse-icon">
    <ChevronLeft size={44} />
  </span>
</div>

<style>
.ft-resize-handle {
  position: absolute;
  top: 2rem;
  right: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 30;
  transition: background-color 150ms ease-out;
}

.ft-resize-handle.ft-resize-hover {
  background-color: var(--accent-primary);
  transition-delay: 250ms;
}

.ft-collapse-icon {
  position: absolute;
  top: 0;
  right: 6px;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  border-radius: 6px;
  color: var(--text-secondary);
  background-color: var(--surface-hover);
  opacity: 0;
  cursor: pointer;
  transition: opacity 150ms ease-out;
}

.ft-resize-handle.ft-resize-hover .ft-collapse-icon {
  opacity: 1;
  transition-delay: 250ms;
}

.cursor-col-resize {
  cursor: col-resize;
}
</style>
