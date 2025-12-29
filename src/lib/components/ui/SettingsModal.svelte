<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { toastStore } from "$lib/stores/toastStore.svelte.ts";
    import { callBackend } from "$lib/utils/backend";
    import { saveSettings } from "$lib/utils/settings";
    import { DEFAULT_THEMES } from "$lib/utils/themes";
    import { Keyboard, Search, Settings, X } from "lucide-svelte";
    import Modal from "./Modal.svelte";

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    let searchQuery = $state("");
    let searchInputEl = $state<HTMLInputElement>();

    $effect(() => {
        if (isOpen) {
            callBackend("get_available_themes", {}, "Settings:Load")
                .then((customThemes: string[]) => {
                    const defaults = Object.keys(DEFAULT_THEMES);
                    const customs = customThemes.filter((t) => !defaults.includes(t));
                    appContext.app.availableThemes = [...defaults, ...customs];

                    if (!appContext.app.availableThemes.includes(appContext.app.activeTheme)) {
                        appContext.app.activeTheme = "default-dark";
                        saveSettings();
                    }
                })
                .catch(() => {
                    appContext.app.availableThemes = Object.keys(DEFAULT_THEMES);
                });

            setTimeout(() => searchInputEl?.focus(), 0);
        } else {
            searchQuery = "";
        }
    });

    const settingsDefinitions = $derived([
        { key: "logLevel", label: "Log Level (Restart Required)", type: "select", category: "Advanced", defaultValue: "info", options: ["trace", "debug", "info", "warn", "error"] },

        { key: "activeTheme", label: "Content Theme", type: "select", category: "Appearance", defaultValue: "default-dark", options: appContext.app.availableThemes },

        { key: "editorFontFamily", label: "Font Family", type: "text", category: "Editor", defaultValue: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace" },
        { key: "editorFontSize", label: "Font Size (px)", type: "number", category: "Editor", defaultValue: 14, min: 8, max: 32 },
        { key: "editorWordWrap", label: "Word Wrap", type: "boolean", category: "Editor", defaultValue: true },
        { key: "showWhitespace", label: "Show Whitespace", type: "boolean", category: "Editor", defaultValue: false },
        { key: "enableAutocomplete", label: "Enable Autocomplete", type: "boolean", category: "Editor", defaultValue: true },
        { key: "autocompleteDelay", label: "Autocomplete Delay (ms)", type: "number", category: "Editor", defaultValue: 250, min: 0, max: 2000 },
        { key: "defaultIndent", label: "Default Indentation (spaces)", type: "number", category: "Editor", defaultValue: 2, min: 2, max: 8 },
        { key: "undoDepth", label: "Undo History Depth", type: "number", category: "Editor", defaultValue: 200, min: 10, max: 1000 },
        { key: "recentChangesCount", label: "Recent Changes Number", type: "number", category: "Editor", defaultValue: 10, min: 0, max: 99, tooltip: "Max 99. Set to 0 to disable count-based filtering." },
        { key: "recentChangesTimespan", label: "Recent Changes Time Span (secs)", type: "number", category: "Editor", defaultValue: 60, min: 0, max: 9999, groupWith: "recentChangesCount", tooltip: "Max 9999. Set to 0 for unlimited time." },
        { key: "lineEndingPreference", label: "Line Ending", type: "select", category: "Editor", defaultValue: "system", options: ["system", "LF", "CRLF"], optionLabels: ["System Default", "LF (Unix)", "CRLF (Windows)"] },

        { key: "formatOnSave", label: "Format on Save", type: "boolean", category: "Formatter", defaultValue: false },
        { key: "formatOnPaste", label: "Format on Paste", type: "boolean", category: "Formatter", defaultValue: false },
        { key: "formatterBulletChar", label: "Bullet Character", type: "select", category: "Formatter", defaultValue: "-", options: ["-", "*", "+"] },
        { key: "formatterCodeFence", label: "Code Fence Style", type: "select", category: "Formatter", defaultValue: "```", options: ["```", "~~~"] },
        { key: "formatterTableAlignment", label: "Align Table Columns", type: "boolean", category: "Formatter", defaultValue: true },

        { key: "tabWidthMin", label: "Tab Width Minimum (px)", type: "number", category: "Interface", defaultValue: 100, min: 80, max: 300 },
        { key: "tabWidthMax", label: "Tab Width Maximum (px)", type: "number", category: "Interface", defaultValue: 200, min: 100, max: 400 },
        { key: "tabCycling", label: "Tab Cycling Mode", type: "select", category: "Interface", defaultValue: "mru", options: ["sequential", "mru"], optionLabels: ["Sequential", "MRU"] },
        { key: "newTabPosition", label: "New Tab Position", type: "select", category: "Interface", defaultValue: "end", options: ["beginning", "right", "end"], optionLabels: ["At the Beginning", "To the Right", "At the End"] },
        { key: "startupBehavior", label: "Tab Startup", type: "select", category: "Interface", defaultValue: "last-focused", options: ["first", "last-focused", "new"], optionLabels: ["Show First Tab", "Show Last Focused Tab", "Create New Tab"] },
        { key: "statusBarTransparency", label: "Status Bar Transparency", type: "range", category: "Interface", defaultValue: 0, min: 0, max: 100, step: 5 },
        { key: "tooltipDelay", label: "Tooltip Delay (ms)", type: "number", category: "Interface", defaultValue: 1000, min: 0, max: 5000 },
        { key: "findPanelTransparent", label: "Find Panel Transparent on Hover", type: "boolean", category: "Interface", defaultValue: false },
        { key: "findPanelCloseOnBlur", label: "Find Panel Close on Blur", type: "boolean", category: "Interface", defaultValue: false },

        { key: "previewFontFamily", label: "Font Family", type: "text", category: "Preview", defaultValue: "system-ui, -apple-system, sans-serif" },
        { key: "previewFontSize", label: "Font Size (px)", type: "number", category: "Preview", defaultValue: 16, min: 10, max: 32 },
        { key: "markdownFlavor", label: "Markdown Flavor", type: "select", category: "Preview", defaultValue: "gfm", options: ["gfm", "commonmark"], optionLabels: ["GitHub Flavored Markdown", "CommonMark"] },
    ]);

    let sortedSettings = $derived(
        settingsDefinitions
            .filter((s) => {
                if ((s as any).visibleWhen) {
                    const condition = (s as any).visibleWhen;
                    const dependentValue = getSettingValue(condition.key, null);
                    if (dependentValue !== condition.value) {
                        return false;
                    }
                }

                if (searchQuery.length < 2) return true;
                const fullString = `${s.category}: ${s.label}`;
                return fullString.toLowerCase().includes(searchQuery.toLowerCase());
            })
            .sort((a, b) => {
                if (a.category !== b.category) {
                    return a.category.localeCompare(b.category);
                }
                return a.label.localeCompare(b.label);
            })
    );

    function getSettingValue(key: string, defaultValue: any): any {
        return (appContext.app as any)[key] ?? defaultValue;
    }

    function updateSetting(key: string, value: any, type: string) {
        if (type === "number" || type === "range") {
            value = Number(value);
        }

        const oldValue = (appContext.app as any)[key];
        if (oldValue !== value) {
            (appContext.app as any)[key] = value;
            saveSettings();

            if (key === "logLevel") {
                toastStore.info("Restart required to apply log level changes");
            }
        }
    }

    function openShortcuts() {
        const event = new CustomEvent("open-shortcuts");
        window.dispatchEvent(event);
    }
</script>

<Modal bind:isOpen {onClose} showCloseButton={false}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Settings size={16} class="text-accent-secondary" />
            <h2 class="text-ui font-semibold shrink-0 text-fg-default">Settings</h2>
        </div>

        <div class="flex-1 relative mx-4">
            <Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
            <input bind:this={searchInputEl} bind:value={searchQuery} type="text" placeholder="Search..." class="w-full pl-8 pr-3 py-1 rounded outline-none text-ui bg-bg-input text-fg-default border border-border-main focus:border-accent-primary transition-colors" />
        </div>

        <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0 outline-none text-fg-muted" onclick={openShortcuts} title="Keyboard Shortcuts (F1)" aria-label="Keyboard Shortcuts">
            <Keyboard size={16} />
        </button>

        <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0 outline-none text-fg-muted" onclick={onClose} aria-label="Close Settings">
            <X size={16} />
        </button>
    {/snippet}

    <div class="p-4 flex flex-col gap-4">
        {#if sortedSettings.length > 0}
            <div>
                {#each sortedSettings as setting, index}
                    <div class="py-3" style:border-top={index > 0 && !(setting as any).visibleWhen && !(setting as any).groupWith ? "1px solid var(--color-border-main)" : "none"}>
                        <div class="flex items-center justify-between gap-6">
                            <label for={setting.key} class="flex-1 flex items-center whitespace-nowrap overflow-hidden">
                                <span class="inline-block w-24 text-ui-sm opacity-60 shrink-0 mr-4 text-fg-muted">
                                    {#if (setting as any).visibleWhen}
                                        <!-- Indented child -->
                                    {:else}
                                        {setting.category}:
                                    {/if}
                                </span>
                                <span class="font-medium text-ui truncate text-fg-default">
                                    {setting.label}
                                </span>
                            </label>
                            <div class="w-56 shrink-0">
                                {#if setting.type === "text"}
                                    <input id={setting.key} type="text" value={getSettingValue(setting.key, setting.defaultValue)} oninput={(e) => updateSetting(setting.key, e.currentTarget.value, setting.type)} class="w-full px-2 py-1 rounded text-ui outline-none border bg-bg-input text-fg-default border-border-main focus:border-accent-primary transition-colors" use:tooltip={(setting as any).tooltip || ""} />
                                {:else if setting.type === "number"}
                                    <input id={setting.key} type="number" value={getSettingValue(setting.key, setting.defaultValue)} min={setting.min} max={setting.max} oninput={(e) => updateSetting(setting.key, e.currentTarget.value, setting.type)} class="w-full px-2 py-1 rounded text-ui outline-none border bg-bg-input text-fg-default border-border-main focus:border-accent-primary transition-colors" use:tooltip={(setting as any).tooltip || ""} />
                                {:else if setting.type === "range"}
                                    <div class="flex items-center gap-3">
                                        <input id={setting.key} type="range" value={getSettingValue(setting.key, setting.defaultValue)} min={setting.min} max={setting.max} step={setting.step} oninput={(e) => updateSetting(setting.key, e.currentTarget.value, setting.type)} class="flex-1 cursor-pointer h-1.5 rounded-full appearance-none bg-border-main accent-accent-primary" />
                                        <span class="text-ui-sm w-10 text-right font-mono opacity-80 text-fg-muted">{getSettingValue(setting.key, setting.defaultValue)}%</span>
                                    </div>
                                {:else if setting.type === "boolean"}
                                    <input id={setting.key} type="checkbox" checked={getSettingValue(setting.key, setting.defaultValue)} onchange={(e) => updateSetting(setting.key, e.currentTarget.checked, setting.type)} class="w-4 h-4 rounded cursor-pointer accent-accent-primary" />
                                {:else if setting.type === "select"}
                                    <select id={setting.key} value={getSettingValue(setting.key, setting.defaultValue)} onchange={(e) => updateSetting(setting.key, e.currentTarget.value, setting.type)} class="w-full px-2 py-1 rounded text-ui outline-none border cursor-pointer bg-bg-input text-fg-default border-border-main">
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
            <div class="px-4 py-8 text-center text-fg-muted">No settings match your search</div>
        {/if}
    </div>
</Modal>
