<script lang="ts">
import { scrollByWheel } from "$lib/utils/wheelScroll";

interface Props {
  viewport: HTMLElement | null;
}

let { viewport }: Props = $props();

const MIN_THUMB_HEIGHT = 20;

let trackRef = $state<HTMLDivElement>();
let thumbRef = $state<HTMLDivElement>();
let thumbHeight = $state(MIN_THUMB_HEIGHT);
let thumbTop = $state(0);
let isVisible = $state(false);
let isDragging = $state(false);

let dragOffset = 0;
let updateRafId = 0;

function scheduleUpdate() {
  cancelAnimationFrame(updateRafId);
  updateRafId = requestAnimationFrame(updateScrollbar);
}

function updateScrollbar() {
  if (!viewport || !trackRef) return;

  const viewportHeight = viewport.clientHeight;
  const trackHeight = trackRef.clientHeight;
  const scrollHeight = viewport.scrollHeight;

  if (!viewportHeight || !trackHeight) return;

  isVisible = scrollHeight > viewportHeight;
  if (!isVisible) return;

  thumbHeight = Math.min(trackHeight, Math.max(MIN_THUMB_HEIGHT, trackHeight * (viewportHeight / scrollHeight)));

  const maxScroll = scrollHeight - viewportHeight;
  const maxThumbTravel = Math.max(0, trackHeight - thumbHeight);
  thumbTop = maxScroll > 0 ? (viewport.scrollTop / maxScroll) * maxThumbTravel : 0;
}

function onTrackClick(e: MouseEvent) {
  if (e.target !== trackRef || !trackRef) return;
  e.preventDefault();

  const trackRect = trackRef.getBoundingClientRect();
  const clickRatio = (e.clientY - trackRect.top) / trackRect.height;

  // A click anywhere in the thumb's own band is handled by the thumb drag, so
  // the remaining track is just the two ends: clicking them jumps to an edge.
  const edgeSnapZone = thumbHeight / trackRect.height;
  let targetRatio = clickRatio;
  if (clickRatio < edgeSnapZone) targetRatio = 0;
  else if (clickRatio > 1 - edgeSnapZone) targetRatio = 1;

  if (viewport) {
    viewport.scrollTop = targetRatio * (viewport.scrollHeight - viewport.clientHeight);
  }
}

function onThumbMouseDown(e: MouseEvent) {
  const thumbRect = thumbRef?.getBoundingClientRect();
  if (!thumbRect) return;
  e.preventDefault();
  e.stopPropagation();

  dragOffset = e.clientY - thumbRect.top;
  isDragging = true;
}

function onDragMove(e: MouseEvent) {
  const trackRect = trackRef?.getBoundingClientRect();
  if (!trackRect || !viewport) return;
  e.preventDefault();

  const maxThumbTravel = trackRect.height - thumbHeight;
  const maxScroll = viewport.scrollHeight - viewport.clientHeight;
  const newThumbTop = Math.max(0, Math.min(maxThumbTravel, e.clientY - trackRect.top - dragOffset));

  thumbTop = newThumbTop;
  viewport.scrollTop = maxThumbTravel > 0 ? (newThumbTop / maxThumbTravel) * maxScroll : 0;
}

function endDrag() {
  isDragging = false;
  scheduleUpdate();
}

// Drag listeners live here so unmounting mid-drag still releases the selection
// lock and the document listeners.
$effect(() => {
  if (!isDragging) return;

  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", endDrag);

  return () => {
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", endDrag);
  };
});

function onScroll() {
  if (!isDragging) scheduleUpdate();
}

function onWheel(e: WheelEvent) {
  if (!viewport) return;
  scrollByWheel(e, viewport);
}

$effect(() => {
  const el = viewport;
  if (!el) return;

  // The scroller's own box does not change when its content does, and content
  // wrappers get replaced (or have no box at all, e.g. `display: contents`), so
  // watch the subtree rather than a single child element.
  const resizeObserver = new ResizeObserver(scheduleUpdate);
  resizeObserver.observe(el);

  const contentObserver = new MutationObserver(scheduleUpdate);
  contentObserver.observe(el, { childList: true, subtree: true, characterData: true });

  el.addEventListener("scroll", onScroll, { passive: true });
  // Late-loading media changes height with no mutation to observe.
  el.addEventListener("load", scheduleUpdate, true);
  updateScrollbar();

  return () => {
    resizeObserver.disconnect();
    contentObserver.disconnect();
    el.removeEventListener("scroll", onScroll);
    el.removeEventListener("load", scheduleUpdate, true);
    cancelAnimationFrame(updateRafId);
  };
});
</script>

<div
  bind:this={trackRef}
  role="none"
  class="scrollbar-track"
  data-visible={isVisible ? "true" : "false"}
  onmousedown={onTrackClick}
  onwheel={onWheel}
>
  <div
    bind:this={thumbRef}
    role="none"
    class="scrollbar-thumb"
    data-dragging={isDragging ? "true" : "false"}
    style:height={`${thumbHeight}px`}
    style:transform={`translateY(${thumbTop}px)`}
    onmousedown={onThumbMouseDown}
  ></div>
</div>
