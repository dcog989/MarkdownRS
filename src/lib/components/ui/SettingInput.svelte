<script lang="ts">
import { tooltip } from '$lib/actions/tooltip';
import type { SettingDef } from '$lib/utils/settingsDefinitions';
import DictionarySelector from './DictionarySelector.svelte';
import Input from './Input.svelte';

let {
    setting,
    value,
    onChange,
    isContextMenuEnabled = false,
    isCheckingContextMenu = false,
    onToggleContextMenu,
}: {
    setting: SettingDef;
    value: unknown;
    onChange: (value: unknown) => void;
    isContextMenuEnabled?: boolean;
    isCheckingContextMenu?: boolean;
    onToggleContextMenu?: (enable: boolean) => void;
} = $props();
</script>

<div use:tooltip={setting.tooltip}>
    {#if setting.type === 'text'}
        <Input
            id={setting.key}
            type="text"
            value={String(value ?? setting.defaultValue)}
            oninput={(e) => onChange(e.currentTarget.value)} />
    {:else if setting.type === 'number'}
        <Input
            id={setting.key}
            type="number"
            value={Number(value ?? setting.defaultValue)}
            min={setting.min}
            max={setting.max}
            oninput={(e) => onChange(Number(e.currentTarget.value))} />
    {:else if setting.type === 'range'}
        <div class="flex items-center gap-3">
            <input
                id={setting.key}
                type="range"
                value={Number(value ?? setting.defaultValue)}
                min={setting.min}
                max={setting.max}
                step={setting.step}
                oninput={(e) => onChange(Number(e.currentTarget.value))}
                class="bg-border-main accent-accent-primary h-1.5 flex-1 cursor-pointer appearance-none rounded-full range-slider-accent" />
            <span class="text-ui-sm text-fg-muted w-10 text-right font-mono opacity-80">
                {Number(value ?? setting.defaultValue)}%
            </span>
        </div>
    {:else if setting.type === 'boolean'}
        <input
            id={setting.key}
            type="checkbox"
            checked={Boolean(value ?? setting.defaultValue)}
            onchange={(e) => onChange(e.currentTarget.checked)}
            class="accent-accent-primary h-4 w-4 cursor-pointer rounded" />
    {:else if setting.type === 'select'}
        <select
            id={setting.key}
            value={String(value ?? setting.defaultValue)}
            onchange={(e) => onChange(e.currentTarget.value)}
            class="text-ui bg-bg-input text-fg-default w-full cursor-pointer rounded border px-2 py-1 outline-none">
            {#each setting.options || [] as option, idx (option)}
                <option value={option}>
                    {setting.optionLabels?.[idx] || option}
                </option>
            {/each}
        </select>
    {:else if setting.type === 'dictionary-multi-select'}
        <div>
            <DictionarySelector
                selected={value as string[]}
                onChange={(dicts) => onChange(dicts)} />
        </div>
    {:else if setting.type === 'custom-context-menu'}
        <input
            id={setting.key}
            type="checkbox"
            checked={isContextMenuEnabled}
            onchange={(e) => onToggleContextMenu?.(e.currentTarget.checked)}
            class="accent-accent-primary h-4 w-4 cursor-pointer rounded"
            disabled={isCheckingContextMenu} />
    {/if}
</div>
