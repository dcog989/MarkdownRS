<script lang="ts">
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { AlertCircle, CheckCircle, Info, X, XCircle } from "lucide-svelte";
    import { onMount } from "svelte";
    import { fly } from "svelte/transition";

    const activeTimers = new Set<string>();

    function getIcon(type: string) {
        switch (type) {
            case "success":
                return CheckCircle;
            case "error":
                return XCircle;
            case "warning":
                return AlertCircle;
            default:
                return Info;
        }
    }

    function getColor(type: string) {
        switch (type) {
            case "success":
                return "#10b981"; // green
            case "error":
                return "#ef4444"; // red
            case "warning":
                return "#f59e0b"; // amber
            default:
                return "#3b82f6"; // blue
        }
    }

    function startDismissal(id: string, duration: number) {
        if (activeTimers.has(id)) return;
        activeTimers.add(id);

        setTimeout(() => {
            appContext.ui.toast.dismiss(id);
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

<div class="toast-container">
    {#each appContext.ui.toast.toasts as toast (toast.id)}
        {@const Icon = getIcon(toast.type)}
        {@const color = getColor(toast.type)}
        <div class="toast" transition:fly={{ y: -20, duration: 200 }} role="alert" aria-live="polite">
            <div class="toast-content" style="border-left-color: {color}">
                <Icon size={16} style="color: {color}; flex-shrink: 0;" />
                <span class="toast-message">{toast.message}</span>
                <button type="button" class="toast-close" onclick={() => appContext.ui.toast.dismiss(toast.id)} aria-label="Dismiss">
                    <X size={14} />
                </button>
            </div>
        </div>
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        top: 2rem;
        right: 2rem;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        pointer-events: none;
    }

    .toast {
        pointer-events: auto;
        max-width: 400px;
        min-width: 300px;
    }

    .toast-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        background-color: var(--color-bg-panel);
        border: 1px solid var(--color-border-main);
        border-left: 3px solid;
        border-radius: 6px;
        box-shadow:
            0 4px 6px -1px rgb(0 0 0 / 0.3),
            0 2px 4px -2px rgb(0 0 0 / 0.3);
        color: var(--color-fg-default);
    }

    .toast-message {
        flex: 1;
        font-size: 13px;
        line-height: 1.4;
    }

    .toast-close {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.25rem;
        background: transparent;
        border: none;
        border-radius: 4px;
        color: var(--color-fg-muted);
        cursor: pointer;
        transition: all 150ms;
        flex-shrink: 0;
    }

    .toast-close:hover {
        background-color: var(--color-bg-hover);
        color: var(--color-fg-default);
    }
</style>
