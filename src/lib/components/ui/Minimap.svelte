<script lang="ts">
import type { EditorView } from "@codemirror/view";
import { handleTrackMouseDown, handleWheel } from "$lib/utils/minimapInteractions";
import type { MinimapLayout } from "$lib/utils/minimapLayout";
import { renderMinimap as renderMinimapCanvas } from "$lib/utils/minimapRenderer";
import { debounce } from "$lib/utils/timing";

interface Props {
  view: EditorView | null;
}

let { view }: Props = $props();

let canvasRef = $state<HTMLCanvasElement>();
let trackRef = $state<HTMLDivElement>();
let hovered = $state(false);

const CONTENT_RENDER_DEBOUNCE_MS = 150;

/** Current content layout, shared by rendering and pointer hit-testing so the
 *  viewport rect and drag map through the same source-line positions used to
 *  draw the content (rather than `scrollHeight`, whose estimate shifts as
 *  CodeMirror measures off-screen lines). */
let minimapLayout: MinimapLayout | null = null;

function renderMinimap() {
  minimapLayout = renderMinimapCanvas(view, canvasRef, trackRef, hovered);
}

let scheduleRafId = 0;

function scheduleRender() {
  if (!view) return;
  cancelAnimationFrame(scheduleRafId);
  scheduleRafId = requestAnimationFrame(renderMinimap);
}

function onTrackMouseDown(e: MouseEvent) {
  if (!view || !canvasRef || !minimapLayout) return;
  handleTrackMouseDown(e, view, canvasRef, minimapLayout);
}

function onWheel(e: WheelEvent) {
  if (!view) return;
  handleWheel(e, view);
}

function onScroll() {
  scheduleRender();
}

let resizeObserver: ResizeObserver;
let contentObserver: MutationObserver;
let themeObserver: MutationObserver;

$effect(() => {
  hovered;
  scheduleRender();
});

$effect(() => {
  if (!view) return;

  const scrollDOM = view.scrollDOM;

  resizeObserver = new ResizeObserver(() => scheduleRender());
  resizeObserver.observe(scrollDOM);
  if (scrollDOM.firstElementChild) {
    resizeObserver.observe(scrollDOM.firstElementChild);
  }

  scrollDOM.addEventListener("scroll", onScroll, { passive: true });

  const debouncedContentRender = debounce(renderMinimap, CONTENT_RENDER_DEBOUNCE_MS);

  const contentEl = scrollDOM.querySelector(".cm-content");
  if (contentEl) {
    contentObserver = new MutationObserver(() => {
      debouncedContentRender();
    });
    contentObserver.observe(contentEl, { characterData: true, childList: true, subtree: true });
  }

  scheduleRender();

  let themeRafId = 0;
  themeObserver = new MutationObserver(() => {
    cancelAnimationFrame(themeRafId);
    themeRafId = requestAnimationFrame(renderMinimap);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  themeObserver.observe(document.head, { childList: true, subtree: true, characterData: true });

  return () => {
    resizeObserver.disconnect();
    contentObserver?.disconnect();
    themeObserver.disconnect();
    scrollDOM.removeEventListener("scroll", onScroll);
    cancelAnimationFrame(themeRafId);
    cancelAnimationFrame(scheduleRafId);
    debouncedContentRender.clear();
  };
});
</script>

<div
  bind:this={trackRef}
  role="none"
  class="minimap-track"
  class:minimap-track-hover={hovered}
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
  onmousedown={onTrackMouseDown}
  onwheel={onWheel}
>
  <canvas bind:this={canvasRef} class="minimap-canvas"></canvas>
</div>

<style>
.minimap-track {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  width: 64px;
  overflow: hidden;
  background: var(--editor-bg);
}
.minimap-track::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.05);
  transition: background 150ms ease;
}
.minimap-track-hover::after {
  background: rgba(255, 255, 255, 0.03);
}
.minimap-canvas {
  display: block;
  pointer-events: none;
  image-rendering: auto;
  position: absolute;
  top: 0;
  left: 0;
}
</style>
