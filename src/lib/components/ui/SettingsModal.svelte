<script lang="ts">
import { Database, Keyboard, Settings, Settings2 } from 'lucide-svelte';
import { _ } from 'svelte-i18n';
import { MODAL_CONSTRAINTS } from '$lib/config/modalSizes';
import { translate } from '$lib/i18n';
import { toggleData, toggleRumdlConfig, toggleShortcuts } from '$lib/stores/interfaceStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { logger } from '$lib/utils/logger';
import { saveSettings } from '$lib/utils/settings';
import { getSettingDefinitions, type SettingDef } from '$lib/utils/settingsDefinitions';
import { shortcutManager } from '$lib/utils/shortcuts';
import { DEFAULT_THEME_NAMES, keyed, LEGACY_THEME_NAMES } from '$lib/utils/themes';
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
        const customs = customThemes
          .filter(
            (t) =>
              !defaults.some((d) => keyed(d) === keyed(t)) && !LEGACY_THEME_NAMES.some((l) => keyed(l) === keyed(t)),
          )
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
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
    showToast('info', enable ? translate('settings.addedToContextMenu') : translate('settings.removedFromContextMenu'));
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
      const fullString = `${translate(s.category)}: ${translate(s.label)}`;
      return fullString.toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      if (a.category !== b.category) {
        return translate(a.category).localeCompare(translate(b.category));
      }
      return translate(a.label).localeCompare(translate(b.label));
    }),
);

function getSettingValue(key: string, defaultValue: unknown): unknown {
  return (appContext.settings as Record<string, unknown>)[key] ?? defaultValue;
}

function updateSetting(setting: SettingDef, value: unknown) {
  let finalValue = value;
  if (setting.type === 'number' || setting.type === 'range') {
    finalValue = Number(value);
  }

  const oldValue = (appContext.settings as Record<string, unknown>)[setting.key];
  if (oldValue !== finalValue && JSON.stringify(oldValue) !== JSON.stringify(finalValue)) {
    (appContext.settings as Record<string, unknown>)[setting.key] = finalValue;
    saveSettings();
    setting.onChange?.(finalValue, oldValue);
  }
}
</script>

<Modal bind:isOpen {onClose} width={MODAL_CONSTRAINTS.SEARCH_WIDTH}>
  {#snippet header()}
    <ModalSearchHeader
      title={$_('settings.modalTitle')}
      icon={Settings}
      bind:searchValue={searchQuery}
      focusDelay={CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS}
      searchPlaceholder={$_('settings.searchPlaceholder')}
      {onClose}
    >
      {#snippet extraActions()}
        <button
          type="button"
          class="text-fg-muted hover-surface shrink-0 rounded p-1 transition-colors outline-none"
          onclick={() => {
                        onClose();
                        toggleShortcuts();
                    }}
          title={`${$_('settings.keyboardShortcuts')} (${shortcutsShortcut})`}
          aria-label={$_('settings.keyboardShortcuts')}
        >
          <Keyboard size={16} />
        </button>
        <button
          type="button"
          class="text-fg-muted hover-surface shrink-0 rounded p-1 transition-colors outline-none"
          onclick={() => {
                        onClose();
                        toggleRumdlConfig();
                    }}
          title={$_('rumdlConfig.title')}
          aria-label={$_('rumdlConfig.title')}
        >
          <Settings2 size={16} />
        </button>
        <button
          type="button"
          class="text-fg-muted hover-surface shrink-0 rounded p-1 transition-colors outline-none"
          onclick={() => {
                        onClose();
                        toggleData();
                    }}
          title={$_('settings.data')}
          aria-label={$_('settings.data')}
        >
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
            <div class="settings-category text-ui-sm py-2.5 pl-3">
              {translate(setting.category)}
            </div>
            <label for={setting.key} class="text-ui text-fg-default font-medium py-2.5 pl-8">
              {translate(setting.label)}
            </label>
            <div class="w-full py-2.5 pl-8 pr-3">
              <SettingInput
                {setting}
                value={getSettingValue(setting.key, setting.defaultValue)}
                onChange={(v) => updateSetting(setting, v)}
                {isContextMenuEnabled}
                {isCheckingContextMenu}
                onToggleContextMenu={toggleContextMenu}
              />
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="text-fg-muted px-4 py-8 text-center">{$_('settings.noMatch')}</div>
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
