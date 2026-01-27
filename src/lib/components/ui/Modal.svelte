<script lang="ts">
    import CustomScrollbar from '$lib/components/ui/CustomScrollbar.svelte';
    import { MODAL_CONSTRAINTS } from '$lib/config/modalSizes';
    import { X } from 'lucide-svelte';
    import type { Snippet } from 'svelte';

    let {
        isOpen = $bindable(false),
        onClose,
        title,
        zIndex = 50,
        position = 'top',
        header,
        footer,
        children,
    } = $props<{
        isOpen: boolean;
        onClose: () => void;
        title?: string;
        zIndex?: number;
        position?: 'center' | 'top';
        header?: Snippet;
        footer?: Snippet;
        children: Snippet;
    }>();

    let viewport = $state<HTMLDivElement>();
    let content = $state<HTMLDivElement>();
    let modalPanel = $state<HTMLDivElement>();

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (isOpen && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    }

    function getFocusableElements(container: HTMLElement): HTMLElement[] {
        const selector =
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return Array.from(container.querySelectorAll(selector));
    }

    function handleTabKey(e: KeyboardEvent) {
        if (!isOpen || !modalPanel) return;
        if (e.key !== 'Tab') return;

        const focusableElements = getFocusableElements(modalPanel);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            // Shift + Tab: moving backwards
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            // Tab: moving forwards
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }

    // Store the previously focused element to restore focus when modal closes
    let previouslyFocusedElement = $state<HTMLElement | null>(null);

    $effect(() => {
        if (isOpen && modalPanel) {
            // Store the previously focused element
            previouslyFocusedElement = document.activeElement as HTMLElement;

            // Focus the first focusable element when modal opens
            const focusableElements = getFocusableElements(modalPanel);
            if (focusableElements.length > 0) {
                // Delay to ensure DOM is ready and child components have initialized
                setTimeout(() => {
                    if (!modalPanel) return;
                    // Re-query in case DOM changed
                    const currentFocusable = getFocusableElements(modalPanel);
                    if (
                        currentFocusable.length > 0 &&
                        !modalPanel.contains(document.activeElement)
                    ) {
                        currentFocusable[0].focus();
                    }
                }, 50);
            }

            // Set up a focus monitor to catch focus escaping the modal
            const handleFocusOut = (e: FocusEvent) => {
                if (!modalPanel) return;
                const target = e.relatedTarget as HTMLElement;

                // If focus is moving outside the modal, bring it back
                if (target && !modalPanel.contains(target)) {
                    e.preventDefault();
                    const focusable = getFocusableElements(modalPanel);
                    if (focusable.length > 0) {
                        focusable[0].focus();
                    }
                }
            };

            modalPanel.addEventListener('focusout', handleFocusOut);

            return () => {
                modalPanel?.removeEventListener('focusout', handleFocusOut);

                // Blur the previously focused element to remove focus outline
                if (previouslyFocusedElement && document.body.contains(previouslyFocusedElement)) {
                    (previouslyFocusedElement as HTMLElement).blur();
                }
            };
        }
    });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="ui-backdrop z-index-auto pointer-events-auto {position === 'center'
            ? 'items-center'
            : 'items-start pt-16'}"
        style="z-index: {zIndex};"
        onclick={handleBackdropClick}
        onkeydown={handleTabKey}>
        <div
            bind:this={modalPanel}
            class="ui-panel shadow-2xl"
            style="min-width: {MODAL_CONSTRAINTS.MIN_WIDTH}; max-width: {MODAL_CONSTRAINTS.MAX_WIDTH}; max-height: calc(100vh - 5rem); width: fit-content; display: flex; flex-direction: column;"
            onclick={(e) => e.stopPropagation()}>
            <!-- Header Strategy: Snippet First, then Title+Close Default -->
            {#if header}
                <div class="ui-header flex items-center justify-between">
                    {@render header()}
                </div>
            {:else if title}
                <div class="ui-header flex items-center justify-between">
                    <span class="text-fg-default text-sm font-semibold">{title}</span>
                    <button
                        class="text-fg-muted hover-surface rounded p-1 transition-colors"
                        onclick={onClose}
                        aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
            {/if}

            <!-- Body with Internal Scrollbar Logic -->
            <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <div bind:this={viewport} class="no-scrollbar flex-1 overflow-y-auto">
                    <div bind:this={content} class="flex-flow-root">
                        {@render children()}
                    </div>
                </div>
                {#if viewport}
                    <CustomScrollbar {viewport} {content} />
                {/if}
            </div>

            <!-- Footer -->
            {#if footer}
                <div class="bg-bg-panel flex shrink-0 justify-end gap-2 border-t px-4 py-3">
                    {@render footer()}
                </div>
            {/if}
        </div>
    </div>
{/if}
