<script lang="ts">
import { Database, Keyboard, Settings } from 'lucide-svelte';
import { syncThemeFromActiveTheme } from '$lib/stores/appState.svelte';
import { toggleData, toggleShortcuts } from '$lib/stores/interfaceStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { showToast } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { getActiveEditorView } from '$lib/utils/editorCommands';
import { saveSettings } from '$lib/utils/settings';
import { getSettingDefinitions, type SettingDef } from '$lib/utils/settingsDefinitions';
import { shortcutManager } from '$lib/utils/shortcuts';
import { spellcheckState } from '$lib/utils/spellcheck.svelte.ts';
import {
    invalidateSpellcheckCache,
    triggerImmediateLint,
} from '$lib/utils/spellcheckExtension.svelte.ts';
import { DEFAULT_THEME_NAMES, LEGACY_THEME_NAMES } from '$lib/utils/themes';
import Modal from './Modal.svelte';
import ModalSearchHeader from './ModalSearchHeader.svelte';
import SettingInput from './SettingInput.svelte';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

let shortcutsShortcut = $derived(shortcutManager.getShortcutDisplay('window.shortcuts'));

let { isOpen = $bindable(false), onClose }: Props = $props();

let searchQuery = $state('');
let searchInputEl = $state<HTMLInputElement>();

let isContextMenuEnabled = $state(false);
let isCheckingContextMenu = $state(false);
let isWindows = $state(false);

$effect(() => {
    if (isOpen) {
        callBackend('get_app_info', {}, 'Settings:Load').then((info) => {
            if (!info) return;
            isWindows = info.os_platform === 'windows';

            if (isWindows) {
                isCheckingContextMenu = true;
                callBackend('check_context_menu_status', {}, 'Settings:Load')
                    .then((enabled) => {
                        isContextMenuEnabled = enabled ?? false;
                    })
                    .catch(() => {})
                    .finally(() => {
                        isCheckingContextMenu = false;
                    });
            }
        });

        callBackend('get_available_themes', {}, 'Settings:Load')
            .then((customThemes) => {
                if (!customThemes) return;
                const defaults = DEFAULT_THEME_NAMES;
                const customs = customThemes.filter((t) => !defaults.includes(t) && !LEGACY_THEME_NAMES.includes(t));
                appContext.app.availableThemes = ['System', ...defaults, ...customs];

                if (!appContext.app.availableThemes.includes(appContext.app.activeTheme)) {
                    appContext.app.activeTheme = 'System';
                    saveSettings();
                }
            })
            .catch(() => {
                appContext.app.availableThemes = DEFAULT_THEME_NAMES;
            });

        setTimeout(() => searchInputEl?.focus(), CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS);
    } else {
        searchQuery = '';
    }
});

async function toggleContextMenu(enable: boolean) {
    try {
        await callBackend('set_context_menu_item', { enable }, 'Settings:Save');
        isContextMenuEnabled = enable;
        showToast('info', enable ? 'Added to context menu' : 'Removed from context menu');
    } catch {
        isContextMenuEnabled = !enable;
    }
}

let settingsDefinitions = $derived(getSettingDefinitions(appContext.app.availableThemes, isWindows));

let sortedSettings = $derived(
    (settingsDefinitions as SettingDef[])
        .filter((s) => {
            if (s.visibleWhen) {
                const condition = s.visibleWhen;
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
        }),
);

function getSettingValue(key: string, defaultValue: unknown): unknown {
    return (appContext.app as Record<string, unknown>)[key] ?? defaultValue;
}

function updateSetting(key: string, value: unknown, type: string) {
    let finalValue = value;
    if (type === 'number' || type === 'range') {
        finalValue = Number(value);
    }

    const oldValue = (appContext.app as Record<string, unknown>)[key];
    if (oldValue !== finalValue && JSON.stringify(oldValue) !== JSON.stringify(finalValue)) {
        (appContext.app as Record<string, unknown>)[key] = finalValue;
        saveSettings();

        if (key === 'logLevel') {
            showToast('info', 'Restart required to apply log level changes');
        } else if (key === 'activeTheme') {
            syncThemeFromActiveTheme();
        } else if (
            key === 'languageDictionaries' ||
            key === 'technicalDictionaries' ||
            key === 'scienceDictionaries'
        ) {
            spellcheckState.clear();
            invalidateSpellcheckCache();

            appContext.spellcheck.init(true).then(() => {
                showToast('success', 'Spellcheck settings updated');
                const activeView = getActiveEditorView();
                if (activeView) triggerImmediateLint(activeView);
            });
        }
    }
}
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <ModalSearchHeader
            title="Settings"
            icon={Settings}
            bind:searchValue={searchQuery}
            bind:inputRef={searchInputEl}
            searchPlaceholder="Search Settings..."
            {onClose}>
            {#snippet extraActions()}
                <button
                    type="button"
                    class="text-fg-muted hover-surface shrink-0 rounded p-1 transition-colors outline-none"
                    onclick={() => {
                        onClose();
                        toggleShortcuts();
                    }}
                    title={`Keyboard Shortcuts (${shortcutsShortcut})`}
                    aria-label="Keyboard Shortcuts">
                    <Keyboard size={16} />
                </button>
                <button
                    type="button"
                    class="text-fg-muted hover-surface shrink-0 rounded p-1 transition-colors outline-none"
                    onclick={() => {
                        onClose();
                        toggleData();
                    }}
                    title="Data"
                    aria-label="Data">
                    <Database size={16} />
                </button>
            {/snippet}
        </ModalSearchHeader>
    {/snippet}

    <div class="p-4">
        {#if sortedSettings.length > 0}
            <div class="settings-grid" style="row-gap: 0; column-gap: 0;">
                {#each sortedSettings as setting, index (setting.key)}
                    {@const rowClass = index % 2 === 1 ? 'bg-row-even' : ''}

                    <div class="settings-row {rowClass}">
                        <div
                            class="text-ui-sm py-2.5 pl-3 rounded-l-md"
                            style="color: oklch(from var(--text-secondary) l c h / 0.6);">
                            {setting.category}
                        </div>
                        <label
                            for={setting.key}
                            class="text-ui text-fg-default font-medium py-2.5 pl-8">
                            {setting.label}
                        </label>
                        <div class="w-full py-2.5 pl-8 pr-3 rounded-r-md">
                            <SettingInput
                                {setting}
                                value={getSettingValue(setting.key, setting.defaultValue)}
                                onChange={(v) => updateSetting(setting.key, v, setting.type)}
                                {isContextMenuEnabled}
                                {isCheckingContextMenu}
                                onToggleContextMenu={toggleContextMenu} />
                        </div>
                    </div>
                {/each}
            </div>
        {:else}
            <div class="text-fg-muted px-4 py-8 text-center">No settings match your search</div>
        {/if}
    </div>
</Modal>
