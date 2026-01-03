<script lang="ts">
    import { Check, ChevronDown, X } from "lucide-svelte";

    interface Props {
        selected: string[];
        onChange: (selected: string[]) => void;
    }

    let { selected = $bindable([]), onChange }: Props = $props();

    let isOpen = $state(false);
    let dropdownEl = $state<HTMLDivElement>();

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
        { code: "he", name: "Hebrew" },
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
    <div role="button" tabindex="0" onclick={toggleDropdown} onkeydown={handleKeydown} class="w-full px-2 py-1 rounded text-ui text-left outline-none border bg-bg-input text-fg-default border-border-main focus:border-accent-primary transition-colors flex items-center justify-between gap-2 cursor-pointer">
        <div class="flex-1 flex flex-wrap gap-1 items-center min-h-[1.5rem]">
            {#if selected.length === 0}
                <span class="opacity-50">Select dictionaries...</span>
            {:else}
                {#each selected as code}
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-primary/20 text-ui-sm">
                        {availableDictionaries.find((d) => d.code === code)?.name || code}
                        <button type="button" onclick={(e) => removeDict(code, e)} class="hover:text-danger transition-colors flex items-center">
                            <X size={12} />
                        </button>
                    </span>
                {/each}
            {/if}
        </div>
        <ChevronDown size={14} class="opacity-50 shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}" />
    </div>

    {#if isOpen}
        <div class="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded border bg-bg-panel border-border-main shadow-lg">
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
