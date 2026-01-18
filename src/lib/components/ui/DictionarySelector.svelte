<script lang="ts">
    import { Check, ChevronDown, X } from 'lucide-svelte';

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

    // Complete list from wooorm/dictionaries (filtered for distinct/major variants)
    const availableDictionaries = [
        { code: 'af', name: 'Afrikaans' },
        { code: 'sq', name: 'Albanian' },
        { code: 'ar', name: 'Arabic' },
        { code: 'hy', name: 'Armenian' },
        { code: 'eu', name: 'Basque' },
        { code: 'bg', name: 'Bulgarian' },
        { code: 'ca', name: 'Catalan' },
        { code: 'zh', name: 'Chinese' },
        { code: 'hr', name: 'Croatian' },
        { code: 'cs', name: 'Czech' },
        { code: 'da', name: 'Danish' },
        { code: 'nl', name: 'Dutch' },
        { code: 'en-US', name: 'English (US)' },
        { code: 'en-AU', name: 'English (Australia)' },
        { code: 'en-CA', name: 'English (Canada)' },
        { code: 'en-GB', name: 'English (UK)' },
        { code: 'en-ZA', name: 'English (South Africa)' },
        { code: 'eo', name: 'Esperanto' },
        { code: 'et', name: 'Estonian' },
        { code: 'fi', name: 'Finnish' },
        { code: 'fr', name: 'French' },
        { code: 'gl', name: 'Galician' },
        { code: 'de', name: 'German' },
        { code: 'de-AT', name: 'German (Austria)' },
        { code: 'de-CH', name: 'German (Switzerland)' },
        { code: 'el', name: 'Greek' },
        { code: 'he', name: 'Hebrew' },
        { code: 'hi', name: 'Hindi' },
        { code: 'hu', name: 'Hungarian' },
        { code: 'is', name: 'Icelandic' },
        { code: 'id', name: 'Indonesian' },
        { code: 'it', name: 'Italian' },
        { code: 'ja', name: 'Japanese' },
        { code: 'ko', name: 'Korean' },
        { code: 'la', name: 'Latin' },
        { code: 'lv', name: 'Latvian' },
        { code: 'lt', name: 'Lithuanian' },
        { code: 'mk', name: 'Macedonian' },
        { code: 'mn', name: 'Mongolian' },
        { code: 'nb', name: 'Norwegian (Bokmål)' },
        { code: 'nn', name: 'Norwegian (Nynorsk)' },
        { code: 'fa', name: 'Persian' },
        { code: 'pl', name: 'Polish' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'pt-BR', name: 'Portuguese (Brazil)' },
        { code: 'ro', name: 'Romanian' },
        { code: 'ru', name: 'Russian' },
        { code: 'gd', name: 'Scottish Gaelic' },
        { code: 'sr', name: 'Serbian' },
        { code: 'sk', name: 'Slovak' },
        { code: 'sl', name: 'Slovenian' },
        { code: 'es', name: 'Spanish' },
        { code: 'sv', name: 'Swedish' },
        { code: 'tr', name: 'Turkish' },
        { code: 'uk', name: 'Ukrainian' },
        { code: 'vi', name: 'Vietnamese' },
        { code: 'cy', name: 'Welsh' },
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
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            toggleDropdown();
        }
    }
</script>

<div class="relative w-full" bind:this={dropdownEl}>
    <div
        bind:this={buttonEl}
        role="button"
        tabindex="0"
        onclick={toggleDropdown}
        onkeydown={handleKeydown}
        class="text-ui bg-bg-input text-fg-default border-border-main focus:border-accent-primary flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded border px-2 py-1.5 text-left transition-colors outline-none">
        <div class="flex flex-1 flex-wrap items-center gap-1.5">
            {#if selected.length === 0}
                <span class="text-ui-sm opacity-50">Select dictionaries...</span>
            {:else}
                {#each selected as code (code)}
                    <span
                        class="bg-accent-primary/20 text-ui-sm inline-flex items-center gap-1 rounded px-2 py-1 whitespace-nowrap">
                        {availableDictionaries.find((d) => d.code === code)?.name || code}
                        <button
                            type="button"
                            onclick={(e) => removeDict(code, e)}
                            class="hover:text-danger flex items-center transition-colors"
                            aria-label="Remove {code}">
                            <X size={12} />
                        </button>
                    </span>
                {/each}
            {/if}
        </div>
        <ChevronDown
            size={14}
            class="mt-0.5 shrink-0 self-start opacity-50 transition-transform {isOpen
                ? 'rotate-180'
                : ''}" />
    </div>

    {#if isOpen}
        <div
            class="bg-bg-panel border-border-main absolute z-50 w-full overflow-y-auto rounded border shadow-lg {dropdownPosition ===
            'above'
                ? 'bottom-full mb-1'
                : 'top-full mt-1'}"
            style="max-height: {dropdownMaxHeight}px;">
            {#each availableDictionaries as dict (dict.code)}
                <button
                    type="button"
                    onclick={() => toggleDict(dict.code)}
                    class="text-ui text-fg-default flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5">
                    <span>{dict.name}</span>
                    {#if selected.includes(dict.code)}
                        <Check size={14} class="text-accent-primary" />
                    {/if}
                </button>
            {/each}
        </div>
    {/if}
</div>
