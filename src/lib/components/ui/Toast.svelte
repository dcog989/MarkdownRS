<script lang="ts">
import { CircleAlert, CircleCheckBig, CircleX, Info, X } from "lucide-svelte";
import { onMount } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { fly } from "svelte/transition";
import { _ } from "svelte-i18n";
import { appContext } from "$lib/stores/state.svelte";
import { dismissToast, type ToastType } from "$lib/stores/toastStore.svelte";

const activeTimers = new SvelteSet<string>();

function getIcon(type: string) {
  switch (type) {
    case "success":
      return CircleCheckBig;
    case "error":
      return CircleX;
    case "warning":
      return CircleAlert;
    default:
      return Info;
  }
}

const TOAST_COLORS: Record<ToastType, { border: string; icon: string }> = {
  success: { border: "border-l-success", icon: "text-success" },
  error: { border: "border-l-danger", icon: "text-danger" },
  warning: { border: "border-l-accent-secondary", icon: "text-accent-secondary" },
  info: { border: "border-l-accent-link", icon: "text-accent-link" },
};

function startDismissal(id: string, duration: number) {
  if (activeTimers.has(id)) return;
  activeTimers.add(id);

  setTimeout(() => {
    dismissToast(id);
    activeTimers.delete(id);
  }, duration);
}

function handleInteraction() {
  if (appContext.ui.toast.toasts.length === 0) return;

  for (const toast of appContext.ui.toast.toasts) {
    if (!activeTimers.has(toast.id) && toast.duration > 0) {
      startDismissal(toast.id, toast.duration);
    }
  }
}

onMount(() => {
  const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

  events.forEach((event) => {
    window.addEventListener(event, handleInteraction, { capture: true, passive: true });
  });

  return () => {
    events.forEach((event) => {
      window.removeEventListener(event, handleInteraction, { capture: true });
    });
  };
});
</script>

<div class="pointer-events-none fixed top-8 right-8 z-9999 flex flex-col gap-2">
  {#each appContext.ui.toast.toasts as toast (toast.id)}
    {@const Icon = getIcon(toast.type)}
    {@const colors = TOAST_COLORS[toast.type]}

    <div
      class="pointer-events-auto max-w-100 min-w-75"
      transition:fly={{ y: -20, duration: 200 }}
      role="alert"
      aria-live="polite"
    >
      <div
        class="bg-bg-panel text-fg-default flex items-center gap-3 rounded-lg border border-l-3 px-4 py-3 shadow-lg {colors.border}"
      >
        <Icon size={16} class="shrink-0 {colors.icon}" />
        <span class="flex-1 text-ui leading-snug">{toast.message}</span>
        {#if toast.action}
          <button
            type="button"
            class="btn-ghost btn-ghost--link btn-sm"
            onclick={() => {
              toast.action?.onClick();
              dismissToast(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        {/if}
        <button
          type="button"
          class="btn-icon shrink-0"
          onclick={() => dismissToast(toast.id)}
          aria-label={$_("common.dismiss")}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  {/each}
</div>
