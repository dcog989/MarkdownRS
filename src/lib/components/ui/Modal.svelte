<script lang="ts">
import X from "lucide-svelte/icons/x";
import type { Snippet } from "svelte";
import { _ } from "svelte-i18n";
import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
import { MODAL_CONSTRAINTS } from "$lib/config/modalSizes";
import { dialogStore } from "$lib/stores/dialogStore.svelte";
import { asHTMLElement, getActiveHTMLElement, queryHTMLElements } from "$lib/utils/dom";

let {
  isOpen = $bindable(false),
  onClose,
  title,
  zIndex = 100,
  position = "top",
  width = "fit-content",
  header,
  footer,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  zIndex?: number;
  position?: "center" | "top";
  width?: string;
  header?: Snippet;
  footer?: Snippet;
  children: Snippet;
} = $props();

let viewport = $state<HTMLDivElement>();
let modalPanel = $state<HTMLDivElement>();

const selector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function handleKeydown(e: KeyboardEvent) {
  if (!isOpen) return;

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    onClose();
    return;
  }

  if (e.key !== "Tab") return;

  const focusableElements = modalPanel ? queryHTMLElements(modalPanel, selector) : [];
  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    }
  } else {
    if (document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
}

// Store the previously focused element to restore focus when modal closes
let previouslyFocusedElement = $state<HTMLElement | null>(null);

$effect(() => {
  if (!isOpen) return;

  // Store the previously focused element
  previouslyFocusedElement = getActiveHTMLElement();

  // Reset scroll position to top
  viewport?.scrollTo(0, 0);

  // Focus the first focusable element when modal opens
  const focusableElements = modalPanel ? queryHTMLElements(modalPanel, selector) : [];
  if (focusableElements.length > 0) {
    setTimeout(() => {
      const currentFocusable = modalPanel ? queryHTMLElements(modalPanel, selector) : [];
      if (currentFocusable.length > 0 && !modalPanel?.contains(document.activeElement)) {
        currentFocusable[0].focus();
      }
    }, 16);
  }

  // Set up a focus monitor to catch focus escaping the modal
  const handleFocusOut = (e: FocusEvent) => {
    // A shared confirmation/prompt dialog is on top and owns the focus; stealing
    // it back here would fight that dialog and break its keyboard handling.
    if (dialogStore.isOpen || dialogStore.promptIsOpen) return;

    const target = asHTMLElement(e.relatedTarget);

    // If focus is moving outside the modal, bring it back
    if (target && !modalPanel?.contains(target)) {
      e.preventDefault();
      const focusable = modalPanel ? queryHTMLElements(modalPanel, selector) : [];
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }
  };

  modalPanel?.addEventListener("focusout", handleFocusOut);
  modalPanel?.addEventListener("keydown", handleKeydown);

  return () => {
    modalPanel?.removeEventListener("focusout", handleFocusOut);
    modalPanel?.removeEventListener("keydown", handleKeydown);

    // Restore focus (e.g. the editor) so keyboard input keeps working after closing.
    // preventScroll keeps CodeMirror from scrolling its contentDOM (anchored at the
    // document top) back to the top.
    if (previouslyFocusedElement && document.body.contains(previouslyFocusedElement)) {
      previouslyFocusedElement.focus({ preventScroll: true });
    }
  };
});
</script>

{#if isOpen}
  <div
    class="ui-backdrop z-index-auto justify-center pointer-events-auto {position === "center"
      ? "items-center"
      : "items-start pt-12"}"
    style:z-index={zIndex}
  >
    <button
      type="button"
      class="absolute inset-0 cursor-default"
      tabindex="-1"
      aria-label={$_("modal.closeModal")}
      onclick={onClose}
    ></button>
    <div
      bind:this={modalPanel}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      class="ui-panel flex-col shadow-2xl"
      style:min-width={MODAL_CONSTRAINTS.MIN_WIDTH}
      style:max-width={MODAL_CONSTRAINTS.MAX_WIDTH}
      style:max-height="calc(100vh - 5rem)"
      style:width={width}
    >
      <!-- Header Strategy: Snippet First, then Title+Close Default -->
      {#if header}
        <div class="ui-header flex items-center justify-between">
          {@render header()}
        </div>
      {:else if title}
        <div class="ui-header flex items-center justify-between">
          <span class="text-fg-default text-lg font-semibold">{title}</span>
          <button type="button" class="btn-icon" onclick={onClose} aria-label={$_("common.close")}>
            <X size={18} />
          </button>
        </div>
      {/if}

      <!-- Body with Internal Scrollbar Logic -->
      <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div bind:this={viewport} class="no-scrollbar flex-1 overflow-y-auto">
          <div class="flex-flow-root">
            {@render children()}
          </div>
        </div>
        {#if viewport}
          <CustomScrollbar {viewport} />
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
