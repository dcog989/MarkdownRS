<script lang="ts">
    import { Check, ChevronDown, X } from "lucide-svelte";

    interface Props {
        selected: string[];
        onChange: (selected: string[]) => void;
    }

    let { selected = $bindable([]), onChange }: Props = $props();

    let isOpen = $state(false);
    let dropdownEl = $state<HTMLDivElement>();
    let buttonEl = $state<HTMLDivElement>();
    let dropdownPosition = $state<'below' | 'above'>('below');
    let dropdownMaxHeight = $state(256); // Default 256px (max-h-64)

    // Popular dictionaries from wooorm/dictionaries
    const availableDictionaries = [
        { code: "ar", name: "Arabic" },
        { code: "zh", name: "Chinese" },
        { code: "cs", name: "Czech" },
        { code: "da", name: "Danish" },
        { code: "nl", name: "Dutch" },
        { code: "en-AU", name: "English (Australian)" },
        { code: "en-CA", name: "English (Canadian)" },
        { code: "en-GB", name: "English (British)" },
        { code: "en-ZA", name: "English (South African)" },
        { code: "en", name: "English (US)" },
        { code: "de-AT", name: "German (Austrian)" },
        { code: "de-CH", name: "German (Swiss)" },
        { code: "de", name: "German" },
        { code: "el", name: "Greek" },
        { code: "fi", name: "Finnish" },
        { code: "fr", name: "French" },
        { code: "hi", name: "Hindi" },
        { code: "hu", name: "Hungarian" },
        { code: "it", name: "Italian" },
        { code: "ja", name: "Japanese" },
        { code: "ko", name: "Korean" },
        { code: "no", name: "Norwegian" },
        { code: "fa", name: "Persian" },
        { code: "pl", name: "Polish" },
        { code: "pt-BR", name: "Portuguese (Brazilian)" },
        { code: "pt", name: "Portuguese" },
        { code: "ru", name: "Russian" },
        { code: "es", name: "Spanish" },
        { code: "sv", name: "Swedish" },
        { code: "tr", name: "Turkish" },
        { code: "uk", name: "Ukrainian" },
        { code: "vi", name: "Vietnamese" },
    ];

    function toggleDropdown() {
        if (!isOpen && buttonEl) {
            // Calculate optimal position and max height before opening
            const rect = buttonEl.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const minDropdownHeight = 200; // Minimum usable height
            const padding = 16; // Leave some padding from viewport edges
            
            // Calculate max height based on available space
            if (spaceBelow < minDropdownHeight && spaceAbove > spaceBelow) {
                // Open above
                dropdownPosition = 'above';
                dropdownMaxHeight = Math.min(spaceAbove - padding, 500); // Max 500px
            } else {
                // Open below
                dropdownPosition = 'below';
                dropdownMaxHeight = Math.min(spaceBelow - padding, 500); // Max 500px
            }
            
            // Ensure minimum height
            dropdownMaxHeight = Math.max(dropdownMaxHeight, minDropdownHeight);
        }
        isOpen = !isOpen;
    }

    function toggleDict(code: string) {
        if (selected.includes(code)) {
            selected = selected.filter((d) => d !== code);
        } else {
            selected = [...selected, code];
        }
        onChange(selected);
    }

    function removeDict(code: string, event: Event) {
        event.stopPropagation();
        selected = selected.filter((d) => d !== code);
        onChange(selected);
    }

    function handleClickOutside(event: MouseEvent) {
        if (dropdownEl && !dropdownEl.contains(event.target as Node)) {
            isOpen = false;
        }
    }

    $effect(() => {
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" || e.key === " ") {
            toggleDropdown();
        }
    }
</script>

<div class="relative w-full" bind:this={dropdownEl}>
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div bind:this={buttonEl} role="button" tabindex="0" onclick={toggleDropdown} onkeydown={handleKeydown} class="w-full px-2 py-1.5 rounded text-ui text-left outline-none border bg-bg-input text-fg-default border-border-main focus:border-accent-primary transition-colors flex items-center justify-between gap-2 cursor-pointer min-h-[2.25rem]">
        <div class="flex-1 flex flex-wrap gap-1.5 items-center">
            {#if selected.length === 0}
                <span class="opacity-50 text-ui-sm">Select dictionaries...</span>
            {:else}
                {#each selected as code}
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded bg-accent-primary/20 text-ui-sm whitespace-nowrap">
                        {availableDictionaries.find((d) => d.code === code)?.name || code}
                        <button type="button" onclick={(e) => removeDict(code, e)} class="hover:text-danger transition-colors flex items-center" aria-label="Remove {code}">
                            <X size={12} />
                        </button>
                    </span>
                {/each}
            {/if}
        </div>
        <ChevronDown size={14} class="opacity-50 shrink-0 transition-transform self-start mt-0.5 {isOpen ? 'rotate-180' : ''}" />
    </div>

    {#if isOpen}
        <div class="absolute z-50 w-full overflow-y-auto rounded border bg-bg-panel border-border-main shadow-lg {dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'}" style="max-height: {dropdownMaxHeight}px;">
            {#each availableDictionaries as dict}
                <button type="button" onclick={() => toggleDict(dict.code)} class="w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center justify-between gap-2 text-ui text-fg-default">
                    <span>{dict.name}</span>
                    {#if selected.includes(dict.code)}
                        <Check size={14} class="text-accent-primary" />
                    {/if}
                </button>
            {/each}
        </div>
    {/if}
</div>
