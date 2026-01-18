<script lang="ts">
    import { tooltip } from '$lib/actions/tooltip';
    import DictionarySelector from '$lib/components/ui/DictionarySelector.svelte';
    import Input from '$lib/components/ui/Input.svelte';
    import { toggleShortcuts } from '$lib/stores/interfaceStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { showToast } from '$lib/stores/toastStore.svelte';
    import { callBackend } from '$lib/utils/backend';
    import { saveSettings } from '$lib/utils/settings';
    import { clearDictionaries } from '$lib/utils/spellcheck.svelte.ts';
    import {
        invalidateSpellcheckCache,
        triggerImmediateLint,
    } from '$lib/utils/spellcheckExtension.svelte.ts';
    import { DEFAULT_THEME_NAMES } from '$lib/utils/themes';
    import { Keyboard, Search, Settings, X } from 'lucide-svelte';
    import Modal from './Modal.svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    let searchQuery = $state('');
    let searchInputEl = $state<HTMLInputElement>();

    // Windows Context Menu State
    let isContextMenuEnabled = $state(false);
    let isCheckingContextMenu = $state(false);
    let isWindows = $state(false);

    $effect(() => {
        if (isOpen) {
            // Get platform info first
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
                    const customs = customThemes.filter((t) => !defaults.includes(t));
                    appContext.app.availableThemes = [...defaults, ...customs];

                    if (!appContext.app.availableThemes.includes(appContext.app.activeTheme)) {
                        appContext.app.activeTheme = 'default-dark';
                        saveSettings();
                    }
                })
                .catch(() => {
                    appContext.app.availableThemes = DEFAULT_THEME_NAMES;
                });

            setTimeout(() => searchInputEl?.focus(), 0);
        } else {
            searchQuery = '';
        }
    });

    async function toggleContextMenu(enable: boolean) {
        try {
            await callBackend('set_context_menu_item', { enable }, 'Settings:Save');
            isContextMenuEnabled = enable;
            showToast('info', enable ? 'Added to context menu' : 'Removed from context menu');
        } catch (_err) {
            // Error handling usually taken care of by callBackend/AppError, but good to reset UI
            isContextMenuEnabled = !enable; // revert
        }
    }

    const settingsDefinitions = $derived([
        {
            key: 'logLevel',
            label: 'Log Level (Restart Required)',
            type: 'select',
            category: 'Advanced',
            defaultValue: 'info',
            options: ['trace', 'debug', 'info', 'warn', 'error'],
        },

        {
            key: 'activeTheme',
            label: 'Content Theme',
            type: 'select',
            category: 'Appearance',
            defaultValue: 'default-dark',
            options: appContext.app.availableThemes,
        },

        {
            key: 'editorFontFamily',
            label: 'Font Family',
            type: 'text',
            category: 'Editor',
            defaultValue:
                "'Source Code Pro', 'Cascadia Code', Menlo, Consolas, 'DejaVu Sans Mono', ui-monospace, monospace",
        },
        {
            key: 'editorFontSize',
            label: 'Font Size (px)',
            type: 'number',
            category: 'Editor',
            defaultValue: 14,
            min: 8,
            max: 32,
        },
        {
            key: 'editorWordWrap',
            label: 'Word Wrap',
            type: 'boolean',
            category: 'Editor',
            defaultValue: true,
        },
        {
            key: 'wrapGuideColumn',
            label: 'Wrap Column',
            type: 'number',
            category: 'Editor',
            defaultValue: 0,
            min: 0,
            max: 500,
            tooltip: 'Hard wrap + show a guide at this column (0 wraps at viewport)',
        },
        {
            key: 'showWhitespace',
            label: 'Whitespace Displayed',
            type: 'boolean',
            category: 'Editor',
            defaultValue: false,
        },
        {
            key: 'enableAutocomplete',
            label: 'Autocomplete',
            type: 'boolean',
            category: 'Editor',
            defaultValue: true,
        },
        {
            key: 'autocompleteDelay',
            label: 'Autocomplete Delay (ms)',
            type: 'number',
            category: 'Editor',
            defaultValue: 850,
            min: 0,
            max: 2000,
        },
        {
            key: 'doubleClickSelectsTrailingSpace',
            label: 'Trailing Space Selected on Double-Click',
            type: 'boolean',
            category: 'Editor',
            defaultValue: false,
            tooltip: 'When double-clicking a word, also select any trailing space',
        },
        {
            key: 'defaultIndent',
            label: 'Indent Default (spaces)',
            type: 'number',
            category: 'Editor',
            defaultValue: 2,
            min: 2,
            max: 8,
        },
        {
            key: 'undoDepth',
            label: 'Undo History Depth',
            type: 'number',
            category: 'Editor',
            defaultValue: 100,
            min: 10,
            max: 999,
        },
        {
            key: 'recentChangesCount',
            label: 'Recent Changes Count',
            type: 'number',
            category: 'Editor',
            defaultValue: 16,
            min: 0,
            max: 99,
            tooltip:
                'Highlight recent changes. Maximum 99. Set to 0 to disable count-based filtering.',
        },
        {
            key: 'recentChangesTimespan',
            label: 'Recent Changes Time Span (secs)',
            type: 'number',
            category: 'Editor',
            defaultValue: 600,
            min: 0,
            max: 9999,
            groupWith: 'recentChangesCount',
            tooltip: 'Max 9999. Set to 0 for unlimited time.',
        },
        {
            key: 'lineEndingPreference',
            label: 'Line Ending',
            type: 'select',
            category: 'Editor',
            defaultValue: 'system',
            options: ['system', 'LF', 'CRLF'],
            optionLabels: ['System Default', 'LF (Unix)', 'CRLF (Windows)'],
        },

        {
            key: 'formatOnSave',
            label: 'Format on Save',
            type: 'boolean',
            category: 'Formatter',
            defaultValue: false,
        },
        {
            key: 'formatOnPaste',
            label: 'Format on Paste',
            type: 'boolean',
            category: 'Formatter',
            defaultValue: false,
        },
        {
            key: 'formatterBulletChar',
            label: 'Bullet Character',
            type: 'select',
            category: 'Formatter',
            defaultValue: '-',
            options: ['-', '*', '+'],
        },
        {
            key: 'formatterCodeFence',
            label: 'Code Fence Style',
            type: 'select',
            category: 'Formatter',
            defaultValue: '```',
            options: ['```', '~~~'],
        },
        {
            key: 'formatterTableAlignment',
            label: 'Align Table Columns',
            type: 'boolean',
            category: 'Formatter',
            defaultValue: true,
        },

        {
            key: 'tabWidthMin',
            label: 'Tab Width Minimum (px)',
            type: 'number',
            category: 'Interface',
            defaultValue: 120,
            min: 80,
            max: 300,
        },
        {
            key: 'tabWidthMax',
            label: 'Tab Width Maximum (px)',
            type: 'number',
            category: 'Interface',
            defaultValue: 180,
            min: 100,
            max: 400,
        },
        {
            key: 'collapsePinnedTabs',
            label: 'Pinned Tabs Collapse',
            type: 'boolean',
            category: 'Interface',
            defaultValue: false,
            tooltip: 'Shrink pinned tabs to icon only',
        },
        {
            key: 'tabCycling',
            label: 'Tab Cycling',
            type: 'select',
            category: 'Interface',
            defaultValue: 'mru',
            options: ['sequential', 'mru'],
            optionLabels: ['Sequential', 'MRU'],
        },
        {
            key: 'tabNameFromContent',
            label: 'Tabs Named from Content',
            type: 'boolean',
            category: 'Interface',
            defaultValue: false,
            tooltip:
                'Automatically name unsaved tabs from first line of content (strips leading whitespace and #)',
        },
        {
            key: 'newTabPosition',
            label: 'Tabs Created At',
            type: 'select',
            category: 'Interface',
            defaultValue: 'end',
            options: ['beginning', 'right', 'end'],
            optionLabels: ['The Beginning', 'The Right', 'The End'],
        },
        {
            key: 'startupBehavior',
            label: 'Tab Startup',
            type: 'select',
            category: 'Interface',
            defaultValue: 'last-focused',
            options: ['first', 'last-focused', 'new'],
            optionLabels: ['Show First', 'Show Last Focused', 'Create New'],
        },
        {
            key: 'statusBarTransparency',
            label: 'Status Bar Transparency',
            type: 'range',
            category: 'Interface',
            defaultValue: 0,
            min: 0,
            max: 100,
            step: 5,
        },
        {
            key: 'tooltipDelay',
            label: 'Tooltip Delay (ms)',
            type: 'number',
            category: 'Interface',
            defaultValue: 1250,
            min: 0,
            max: 5000,
        },
        {
            key: 'findPanelTransparent',
            label: 'Find Panel Hides',
            type: 'boolean',
            category: 'Interface',
            defaultValue: false,
            tooltip: 'The Find Panel will be almost completely transparent when not hovered.',
        },
        {
            key: 'findPanelCloseOnBlur',
            label: 'Find Panel Closes on Blur',
            type: 'boolean',
            category: 'Interface',
            defaultValue: false,
            tooltip: 'The Find Panel will close on any click outside the Find Panel.',
        },
        {
            key: 'neverPrompt',
            label: 'Never Prompt',
            type: 'boolean',
            category: 'Interface',
            defaultValue: false,
            tooltip:
                'Suppress confirmation dialogs (unsaved changes will be discarded immediately when closing tabs).',
        },

        {
            key: 'previewFontFamily',
            label: 'Font Family',
            type: 'text',
            category: 'Preview',
            defaultValue: 'system-ui, -apple-system, sans-serif',
        },
        {
            key: 'previewFontSize',
            label: 'Font Size (px)',
            type: 'number',
            category: 'Preview',
            defaultValue: 16,
            min: 10,
            max: 32,
        },
        {
            key: 'markdownFlavor',
            label: 'Markdown Flavor',
            type: 'select',
            category: 'Preview',
            defaultValue: 'gfm',
            options: ['gfm', 'commonmark'],
            optionLabels: ['GitHub Flavored Markdown', 'CommonMark'],
        },

        {
            key: 'languageDictionaries',
            label: 'Language Dictionaries',
            type: 'dictionary-multi-select',
            category: 'Spellcheck',
            defaultValue: ['en-US'],
            tooltip: 'Select one or more languages, duplicate words are removed by the app.',
        },
        {
            key: 'technicalDictionaries',
            label: 'Technical Dictionaries',
            type: 'boolean',
            category: 'Spellcheck',
            defaultValue: false,
            tooltip: 'Include non-language dictionaries (coding, companies, frameworks, etc.).',
        },
        {
            key: 'scienceDictionaries',
            label: 'Science+ Dictionaries',
            type: 'boolean',
            category: 'Spellcheck',
            defaultValue: false,
            tooltip:
                'Includes scientific (670k+) and medical (98k+) terms. Warning: Large download and higher memory usage.',
        },

        // Windows Only
        ...(isWindows
            ? [
                  {
                      key: 'windowsContextMenu',
                      label: 'Add to System Context Menu',
                      type: 'custom-context-menu',
                      category: 'System',
                      defaultValue: false,
                      tooltip:
                          'Include non-language dictionaries (coding, companies, medical, scientific, etc.).',
                  },
              ]
            : []),
    ]);

    type SettingDef = {
        key: string;
        label: string;
        type: string;
        category: string;
        defaultValue: unknown;
        options?: string[];
        optionLabels?: string[];
        min?: number;
        max?: number;
        step?: number;
        tooltip?: string;
        visibleWhen?: { key: string; value: unknown };
        groupWith?: string;
    };

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function getSettingValue(key: string, defaultValue: any): any {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (appContext.app as any)[key] ?? defaultValue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function updateSetting(key: string, value: any, type: string) {
        if (type === 'number' || type === 'range') {
            value = Number(value);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oldValue = (appContext.app as any)[key];
        if (oldValue !== value && JSON.stringify(oldValue) !== JSON.stringify(value)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (appContext.app as any)[key] = value;
            saveSettings();

            if (key === 'logLevel') {
                showToast('info', 'Restart required to apply log level changes');
            } else if (
                key === 'languageDictionaries' ||
                key === 'technicalDictionaries' ||
                key === 'scienceDictionaries'
            ) {
                clearDictionaries();
                invalidateSpellcheckCache();

                appContext.spellcheck.init(true).then(() => {
                    showToast('success', 'Spellcheck settings updated');
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const activeView = (window as any)._activeEditorView;
                    if (activeView) triggerImmediateLint(activeView);
                });
            }
        }
    }
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Settings size={16} class="text-accent-secondary" />
            <h2 class="text-ui text-fg-default shrink-0 font-semibold">Settings</h2>
        </div>

        <div class="relative mx-4 flex-1">
            <Search
                size={12}
                class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 opacity-50"
            />
            <Input
                bind:ref={searchInputEl}
                bind:value={searchQuery}
                type="text"
                placeholder="Search..."
                class="pr-3 pl-8"
            />
        </div>

        <button
            class="text-fg-muted shrink-0 rounded p-1 transition-colors outline-none hover:bg-white/10"
            onclick={() => toggleShortcuts()}
            title="Keyboard Shortcuts (F1)"
            aria-label="Keyboard Shortcuts"
        >
            <Keyboard size={16} />
        </button>

        <button
            class="text-fg-muted shrink-0 rounded p-1 transition-colors outline-none hover:bg-white/10"
            onclick={onClose}
            aria-label="Close Settings"
        >
            <X size={16} />
        </button>
    {/snippet}

    <div class="flex flex-col gap-4 p-4">
        {#if sortedSettings.length > 0}
            <div>
                {#each sortedSettings as setting, index (setting.key)}
                    <div
                        class="py-3"
                        style:border-top={index > 0 && !setting.visibleWhen && !setting.groupWith
                            ? '1px solid var(--color-border-main)'
                            : 'none'}
                    >
                        <div class="flex items-start justify-between gap-6">
                            <label
                                for={setting.key}
                                class="flex flex-1 items-center overflow-hidden whitespace-nowrap {setting.type.includes(
                                    'multi-select',
                                )
                                    ? 'pt-1.5'
                                    : ''}"
                            >
                                <span
                                    class="text-ui-sm text-fg-muted mr-4 inline-block w-24 shrink-0 opacity-60"
                                >
                                    {#if setting.visibleWhen}
                                        <!-- Indented child -->
                                    {:else}
                                        {setting.category}:
                                    {/if}
                                </span>
                                <span class="text-ui text-fg-default truncate font-medium">
                                    {setting.label}
                                </span>
                            </label>
                            <div
                                class="{setting.type.includes('multi-select')
                                    ? 'max-w-md flex-1'
                                    : 'w-56'} shrink-0"
                                use:tooltip={setting.tooltip || ''}
                            >
                                {#if setting.type === 'text'}
                                    <Input
                                        id={setting.key}
                                        type="text"
                                        value={getSettingValue(setting.key, setting.defaultValue)}
                                        oninput={(e) =>
                                            updateSetting(
                                                setting.key,
                                                e.currentTarget.value,
                                                setting.type,
                                            )}
                                    />
                                {:else if setting.type === 'number'}
                                    <Input
                                        id={setting.key}
                                        type="number"
                                        value={getSettingValue(setting.key, setting.defaultValue)}
                                        min={setting.min}
                                        max={setting.max}
                                        oninput={(e) =>
                                            updateSetting(
                                                setting.key,
                                                e.currentTarget.value,
                                                setting.type,
                                            )}
                                    />
                                {:else if setting.type === 'range'}
                                    <div class="flex items-center gap-3">
                                        <input
                                            id={setting.key}
                                            type="range"
                                            value={getSettingValue(
                                                setting.key,
                                                setting.defaultValue,
                                            )}
                                            min={setting.min}
                                            max={setting.max}
                                            step={setting.step}
                                            oninput={(e) =>
                                                updateSetting(
                                                    setting.key,
                                                    e.currentTarget.value,
                                                    setting.type,
                                                )}
                                            class="bg-border-main accent-accent-primary h-1.5 flex-1 cursor-pointer appearance-none rounded-full"
                                        />
                                        <span
                                            class="text-ui-sm text-fg-muted w-10 text-right font-mono opacity-80"
                                            >{getSettingValue(
                                                setting.key,
                                                setting.defaultValue,
                                            )}%</span
                                        >
                                    </div>
                                {:else if setting.type === 'boolean'}
                                    <input
                                        id={setting.key}
                                        type="checkbox"
                                        checked={getSettingValue(setting.key, setting.defaultValue)}
                                        onchange={(e) =>
                                            updateSetting(
                                                setting.key,
                                                e.currentTarget.checked,
                                                setting.type,
                                            )}
                                        class="accent-accent-primary h-4 w-4 cursor-pointer rounded"
                                    />
                                {:else if setting.type === 'select'}
                                    <select
                                        id={setting.key}
                                        value={getSettingValue(setting.key, setting.defaultValue)}
                                        onchange={(e) =>
                                            updateSetting(
                                                setting.key,
                                                e.currentTarget.value,
                                                setting.type,
                                            )}
                                        class="text-ui bg-bg-input text-fg-default border-border-main w-full cursor-pointer rounded border px-2 py-1 outline-none"
                                    >
                                        {#each setting.options || [] as option, idx (option)}
                                            <option value={option}
                                                >{setting.optionLabels?.[idx] || option}</option
                                            >
                                        {/each}
                                    </select>
                                {:else if setting.type === 'dictionary-multi-select'}
                                    <div>
                                        <DictionarySelector
                                            selected={appContext.app.languageDictionaries}
                                            onChange={(dicts) =>
                                                updateSetting(setting.key, dicts, setting.type)}
                                        />
                                    </div>
                                {:else if setting.type === 'custom-context-menu'}
                                    <input
                                        id={setting.key}
                                        type="checkbox"
                                        checked={isContextMenuEnabled}
                                        onchange={(e) => toggleContextMenu(e.currentTarget.checked)}
                                        class="accent-accent-primary h-4 w-4 cursor-pointer rounded"
                                        disabled={isCheckingContextMenu}
                                    />
                                {/if}
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        {:else}
            <div class="text-fg-muted px-4 py-8 text-center">No settings match your search</div>
        {/if}
    </div>
</Modal>
