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

    function getColorClass(type: string) {
        switch (type) {
            case "success":
                return "text-success border-l-success";
            case "error":
                return "text-danger border-l-danger";
            case "warning":
                return "text-accent-secondary border-l-accent-secondary"; // Using accent as warning color
            default:
                return "text-accent-link border-l-accent-link";
        }
    }

    function getIconColorClass(type: string) {
        switch (type) {
            case "success":
                return "text-success";
            case "error":
                return "text-danger";
            case "warning":
                return "text-accent-secondary";
            default:
                return "text-accent-link";
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

<div class="fixed top-8 right-8 z-[9999] flex flex-col gap-2 pointer-events-none">
    {#each appContext.ui.toast.toasts as toast (toast.id)}
        {@const Icon = getIcon(toast.type)}
        {@const colorClass = getColorClass(toast.type)}
        {@const iconColorClass = getIconColorClass(toast.type)}

        <div class="pointer-events-auto max-w-[400px] min-w-[300px]" transition:fly={{ y: -20, duration: 200 }} role="alert" aria-live="polite">
            <div class="flex items-center gap-3 px-4 py-3 rounded-md shadow-lg border border-border-main border-l-[3px] bg-bg-panel text-fg-default {colorClass.split(' ')[1]}">
                <Icon size={16} class="shrink-0 {iconColorClass}" />
                <span class="flex-1 text-[13px] leading-snug">{toast.message}</span>
                <button type="button" class="flex items-center justify-center p-1 rounded transition-all bg-transparent border-none cursor-pointer text-fg-muted hover:bg-bg-hover hover:text-fg-default shrink-0" onclick={() => appContext.ui.toast.dismiss(toast.id)} aria-label="Dismiss">
                    <X size={14} />
                </button>
            </div>
        </div>
    {/each}
</div>
