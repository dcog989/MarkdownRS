<script lang="ts">
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { dismissToast } from '$lib/stores/toastStore.svelte.ts';
    import { CircleAlert, CircleCheckBig, CircleX, Info, X } from 'lucide-svelte';
    import { onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { fly } from 'svelte/transition';

    const activeTimers = new SvelteSet<string>();

    function getIcon(type: string) {
        switch (type) {
            case 'success':
                return CircleCheckBig;
            case 'error':
                return CircleX;
            case 'warning':
                return CircleAlert;
            default:
                return Info;
        }
    }

    function getColorClass(type: string) {
        switch (type) {
            case 'success':
                return 'text-success border-l-success';
            case 'error':
                return 'text-danger border-l-danger';
            case 'warning':
                return 'text-accent-secondary border-l-accent-secondary'; // Using accent as warning color
            default:
                return 'text-accent-link border-l-accent-link';
        }
    }

    function getIconColorClass(type: string) {
        switch (type) {
            case 'success':
                return 'text-success';
            case 'error':
                return 'text-danger';
            case 'warning':
                return 'text-accent-secondary';
            default:
                return 'text-accent-link';
        }
    }

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
        const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

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
        {@const colorClass = getColorClass(toast.type)}
        {@const iconColorClass = getIconColorClass(toast.type)}

        <div
            class="pointer-events-auto max-w-100 min-w-75"
            transition:fly={{ y: -20, duration: 200 }}
            role="alert"
            aria-live="polite">
            <div
                class="bg-border-main bg-bg-panel text-fg-default flex items-center gap-3 rounded-md border border-l-[3px] px-4 py-3 shadow-lg {colorClass.split(
                    ' ',
                )[1]}">
                <Icon size={16} class="shrink-0 {iconColorClass}" />
                <span class="flex-1 text-[13px] leading-snug">{toast.message}</span>
                <button
                    type="button"
                    class="text-fg-muted hover:bg-bg-hover hover:text-fg-default flex shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent p-1 transition-all"
                    onclick={() => dismissToast(toast.id)}
                    aria-label="Dismiss">
                    <X size={14} />
                </button>
            </div>
        </div>
    {/each}
</div>
