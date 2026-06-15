<script lang="ts">
import { Database, Keyboard, Settings } from 'lucide-svelte';
import { toggleData, toggleShortcuts } from '$lib/stores/interfaceStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { logger } from '$lib/utils/logger';
import { saveSettings } from '$lib/utils/settings';
import { getSettingDefinitions, type SettingDef } from '$lib/utils/settingsDefinitions';
import { shortcutManager } from '$lib/utils/shortcuts';
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
                    .catch((err) => logger.editor.warn('ContextMenuCheckFailed', { error: String(err) }))
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
                appContext.settings.availableThemes = ['System', ...defaults, ...customs];

                if (!appContext.settings.availableThemes.includes(appContext.settings.activeTheme)) {
                    appContext.settings.activeTheme = 'System';
                    saveSettings();
                }
            })
            .catch(() => {
                appContext.settings.availableThemes = DEFAULT_THEME_NAMES;
            });

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

let settingsDefinitions = $derived(getSettingDefinitions(appContext.settings.availableThemes, isWindows));

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

function updateSetting(setting: SettingDef, value: unknown) {
    let finalValue = value;
    if (setting.type === 'number' || setting.type === 'range') {
        finalValue = Number(value);
    }

    const oldValue = (appContext.app as Record<string, unknown>)[setting.key];
    if (oldValue !== finalValue && JSON.stringify(oldValue) !== JSON.stringify(finalValue)) {
        (appContext.app as Record<string, unknown>)[setting.key] = finalValue;
        saveSettings();
        setting.onChange?.(finalValue, oldValue);
    }
}
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <ModalSearchHeader
            title="Settings"
            icon={Settings}
            bind:searchValue={searchQuery}
            focusDelay={CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS}
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
            <div class="settings-grid">
                {#each sortedSettings as setting, index (setting.key)}
                    {@const rowClass = index % 2 === 1 ? 'bg-row-even' : ''}

                    <div class="settings-row {rowClass}">
                        <div
                            class="settings-category text-ui-sm py-2.5 pl-3 rounded-l-md">
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
                                onChange={(v) => updateSetting(setting, v)}
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

<style>
    .settings-grid {
        row-gap: 0;
        column-gap: 0;
    }

    .settings-category {
        color: oklch(from var(--text-secondary) l c h / 0.6);
    }
</style>
