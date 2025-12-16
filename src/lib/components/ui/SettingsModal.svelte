<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { saveSettings } from "$lib/utils/settings";
    import { Keyboard, Search, Settings, X } from "lucide-svelte";

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    let searchQuery = $state("");

    // Settings definitions with categories
    // Labels updated to remove redundancy as we now display "Category: Label"
    const settingsDefinitions = [
        { key: "editorFontFamily", label: "Font Family", type: "text", category: "Editor", defaultValue: "Consolas, 'Courier New', monospace" },
        { key: "editorFontSize", label: "Font Size (px)", type: "number", category: "Editor", defaultValue: 14, min: 8, max: 32 },
        { key: "editorWordWrap", label: "Word Wrap", type: "boolean", category: "Editor", defaultValue: false },
        { key: "lineEndingPreference", label: "Line Ending Preference", type: "select", category: "Editor", defaultValue: "system", options: ["system", "LF", "CRLF"], optionLabels: ["System Default", "LF (Unix)", "CRLF (Windows)"] },

        { key: "previewFontFamily", label: "Font Family", type: "text", category: "Preview", defaultValue: "system-ui, -apple-system, sans-serif" },
        { key: "previewFontSize", label: "Font Size (px)", type: "number", category: "Preview", defaultValue: 16, min: 10, max: 32 },

        { key: "formatOnSave", label: "Auto-format on Save", type: "boolean", category: "Formatter", defaultValue: false },
        { key: "formatOnPaste", label: "Auto-format on Paste", type: "boolean", category: "Formatter", defaultValue: false },
        { key: "formatterListIndent", label: "List Indentation (spaces)", type: "number", category: "Formatter", defaultValue: 2, min: 2, max: 8 },
        { key: "formatterBulletChar", label: "Bullet Character", type: "select", category: "Formatter", defaultValue: "-", options: ["-", "*", "+"] },
        { key: "formatterCodeFence", label: "Code Fence Style", type: "select", category: "Formatter", defaultValue: "```", options: ["```", "~~~"] },
        { key: "formatterTableAlignment", label: "Align Table Columns", type: "boolean", category: "Formatter", defaultValue: true },

        { key: "logLevel", label: "Log Level", type: "select", category: "Advanced", defaultValue: "info", options: ["trace", "debug", "info", "warn", "error"] },

        { key: "tabWidthMin", label: "Tab Width: Minimum (px)", type: "number", category: "Interface", defaultValue: 100, min: 80, max: 300 },
        { key: "tabWidthMax", label: "Tab Width: Maximum (px)", type: "number", category: "Interface", defaultValue: 200, min: 100, max: 400 },
        { key: "tabCycling", label: "Tab Cycling Mode", type: "select", category: "Interface", defaultValue: "sequential", options: ["Sequential", "MRU"] },
        { key: "tabNavigationMode", label: "Tab Navigation (Ctrl+PgUp/PgDn)", type: "select", category: "Interface", defaultValue: "arrow-keys", options: ["arrow-keys", "disabled"], optionLabels: ["Enabled", "Disabled"] },
        { key: "newTabPosition", label: "Open New Tabs", type: "select", category: "Interface", defaultValue: "end", options: ["right", "end"], optionLabels: ["To the Right", "At the End"] },
        { key: "startupBehavior", label: "On Startup", type: "select", category: "Interface", defaultValue: "last-focused", options: ["first", "last-focused", "new"], optionLabels: ["Show First Tab", "Show Last Focused Tab", "Create New Tab"] },
        { key: "statusBarTransparency", label: "Status Bar Transparency", type: "range", category: "Interface", defaultValue: 0, min: 0, max: 100, step: 5 },
        { key: "tooltipDelay", label: "UI: Tooltip Delay (ms)", type: "number", category: "Interface", defaultValue: 1000, min: 0, max: 5000 },
    ];

    // Reset search on close
    $effect(() => {
        if (!isOpen) {
            searchQuery = "";
        }
    });

    // Filter settings
    let sortedSettings = $derived(
        settingsDefinitions
            .filter((s) => {
                if (searchQuery.length < 2) return true;
                const fullString = `${s.category}: ${s.label}`;
                return fullString.toLowerCase().includes(searchQuery.toLowerCase());
            })
            .sort((a, b) => {
                // Sort by Category then Label
                const aFull = `${a.category}: ${a.label}`;
                const bFull = `${b.category}: ${b.label}`;
                return aFull.localeCompare(bFull);
            })
    );

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }

    function getSettingValue(key: string, defaultValue: any): any {
        return (appState as any)[key] ?? defaultValue;
    }

    function updateSetting(key: string, value: any, type: string) {
        if (type === "number" || type === "range") {
            value = Number(value);
        }
        (appState as any)[key] = value;
        saveSettings();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape" && isOpen) {
            e.preventDefault();
            onClose();
        }
    }

    function openShortcuts() {
        const event = new CustomEvent("open-shortcuts");
        window.dispatchEvent(event);
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-center justify-center" style="background-color: var(--bg-backdrop);" onclick={handleBackdropClick}>
        <div class="w-fit min-w-[600px] max-w-[90vw] max-h-[80vh] rounded-lg shadow-2xl border overflow-hidden flex flex-col" style="background-color: var(--bg-panel); border-color: var(--border-light);">
            <!-- Header with integrated Search -->
            <div class="flex items-center gap-4 px-4 py-3 border-b" style="background-color: var(--bg-header); border-color: var(--border-light);">
                <div class="flex items-center gap-2">
                    <Settings size={18} style="color: var(--accent-secondary);" />
                    <h2 class="text-base font-semibold shrink-0" style="color: var(--fg-default);">Settings</h2>
                </div>

                <div class="flex-1 relative">
                    <Search size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                    <input bind:value={searchQuery} type="text" placeholder="Search..." class="w-full pl-8 pr-3 py-1.5 rounded outline-none text-sm" style="background-color: var(--bg-input); color: var(--fg-default); border: 1px solid var(--border-main);" />
                </div>

                <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0" style="color: var(--fg-muted);" onclick={openShortcuts} title="Keyboard Shortcuts (F1)" aria-label="Keyboard Shortcuts">
                    <Keyboard size={18} />
                </button>

                <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0" style="color: var(--fg-muted);" onclick={onClose} aria-label="Close Settings">
                    <X size={18} />
                </button>
            </div>

            <!-- Settings List -->
            <div class="flex-1 overflow-y-auto">
                {#if sortedSettings.length > 0}
                    <div class="divide-y" style="border-color: var(--border-main);">
                        {#each sortedSettings as setting}
                            <div class="px-4 py-3 hover:bg-white/5 transition-colors">
                                <div class="flex items-center justify-between gap-4">
                                    <div class="flex-1">
                                        <label for={setting.key} class="text-sm block mb-1 whitespace-nowrap">
                                            <span style="color: var(--fg-muted);">{setting.category}: </span>
                                            <span class="font-medium" style="color: var(--fg-default);">{setting.label}</span>
                                        </label>
                                    </div>
                                    <div class="w-48 shrink-0">
                                        {#if setting.type === "text"}
                                            <input id={setting.key} type="text" value={getSettingValue(setting.key, setting.defaultValue)} oninput={(e) => updateSetting(setting.key, e.currentTarget.value, setting.type)} class="w-full px-2 py-1 rounded text-sm outline-none" style="background-color: var(--bg-input); color: var(--fg-default); border: 1px solid var(--border-main);" />
                                        {:else if setting.type === "number"}
                                            <input id={setting.key} type="number" value={getSettingValue(setting.key, setting.defaultValue)} min={setting.min} max={setting.max} oninput={(e) => updateSetting(setting.key, e.currentTarget.value, setting.type)} class="w-full px-2 py-1 rounded text-sm outline-none" style="background-color: var(--bg-input); color: var(--fg-default); border: 1px solid var(--border-main);" />
                                        {:else if setting.type === "range"}
                                            <div class="flex items-center gap-2">
                                                <input id={setting.key} type="range" value={getSettingValue(setting.key, setting.defaultValue)} min={setting.min} max={setting.max} step={setting.step} oninput={(e) => updateSetting(setting.key, e.currentTarget.value, setting.type)} class="flex-1 cursor-pointer h-1.5 rounded-full appearance-none" style="background-color: var(--border-main); accent-color: var(--accent-primary);" />
                                                <span class="text-xs w-8 text-right font-mono" style="color: var(--fg-muted);">{getSettingValue(setting.key, setting.defaultValue)}%</span>
                                            </div>
                                        {:else if setting.type === "boolean"}
                                            <input id={setting.key} type="checkbox" checked={getSettingValue(setting.key, setting.defaultValue)} onchange={(e) => updateSetting(setting.key, e.currentTarget.checked, setting.type)} class="w-4 h-4 rounded cursor-pointer" style="accent-color: var(--accent-primary);" />
                                        {:else if setting.type === "select"}
                                            <select id={setting.key} value={getSettingValue(setting.key, setting.defaultValue)} onchange={(e) => updateSetting(setting.key, e.currentTarget.value, setting.type)} class="w-full px-2 py-1 rounded text-sm outline-none" style="background-color: var(--bg-input); color: var(--fg-default); border: 1px solid var(--border-main);">
                                                {#each setting.options as option, idx}
                                                    <option value={option}>{setting.optionLabels?.[idx] || option}</option>
                                                {/each}
                                            </select>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="px-4 py-8 text-center text-sm" style="color: var(--fg-muted);">No settings match your search</div>
                {/if}
            </div>
        </div>
    </div>
{/if}
