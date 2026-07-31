<script lang="ts">
import { open } from '@tauri-apps/plugin-dialog';
import { tooltip } from '$lib/actions/tooltip';
import { MARKDOWN_EXTENSIONS } from '$lib/utils/fileValidation';
import type { SettingDef } from '$lib/utils/settingsDefinitions';
import { elideMiddle } from '$lib/utils/textElide';
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

let path = $derived(value ? String(value) : '');
let pathContainer = $state<HTMLDivElement>();
let pathSpan = $state<HTMLSpanElement>();
let displayPath = $state('No template selected');

function measureCharWidth(el: HTMLElement): number {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = getComputedStyle(el).font;
    return ctx.measureText('M').width;
}

function fitPathToWidth() {
    const span = pathSpan;
    if (!span) return;
    if (!path) {
        displayPath = 'No template selected';
        return;
    }
    const available = span.clientWidth;
    if (available <= 0) return;
    const charWidth = measureCharWidth(span);
    if (charWidth <= 0) return;
    displayPath = elideMiddle(path, Math.floor(available / charWidth));
}

let resizeObserver: ResizeObserver | undefined;

$effect(() => {
    if (setting.type !== 'file') return;
    const container = pathContainer;
    if (!container) return;
    resizeObserver ??= new ResizeObserver(() => fitPathToWidth());
    resizeObserver.observe(container);
    return () => {
        resizeObserver?.disconnect();
        resizeObserver = undefined;
    };
});

$effect(() => {
    if (setting.type !== 'file') return;
    fitPathToWidth();
});
</script>

<div use:tooltip={setting.type === 'file' ? null : setting.tooltip} class="w-full">
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
        <div class="select-wrap">
            <select
                id={setting.key}
                value={String(value ?? setting.defaultValue)}
                onchange={(e) => onChange(e.currentTarget.value)}
                class="text-ui bg-bg-input text-fg-default w-full cursor-pointer rounded border pl-2 py-1 outline-none">
                {#each setting.options || [] as option, idx (option)}
                    <option value={option}>
                        {setting.optionLabels?.[idx] || option}
                    </option>
                {/each}
            </select>
        </div>
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
    {:else if setting.type === 'file'}
        <div class="w-full min-w-0" bind:this={pathContainer}>
        <div class="flex items-center gap-2" use:tooltip={setting.tooltip}>
            <button
                type="button"
                class="btn-base btn-sm bg-accent-primary text-fg-inverse border-transparent font-medium whitespace-nowrap"
                    onclick={async () => {
                        const selected = await open({
                            multiple: false,
                            filters: [{ name: 'Markdown', extensions: MARKDOWN_EXTENSIONS }],
                        });
                        if (selected && typeof selected === 'string') {
                            onChange(selected);
                        }
                    }}>
                    Browse...
                </button>
                {#if value}
                    <button
                        type="button"
                        class="btn-base btn-sm hover-surface whitespace-nowrap"
                        onclick={() => onChange('')}>
                        Clear
                    </button>
                {/if}
            </div>
            <span
                bind:this={pathSpan}
                use:tooltip={path || null}
                class="text-ui text-fg-muted mt-1 block w-full truncate font-mono">
                {displayPath}
            </span>
        </div>
    {/if}
</div>
