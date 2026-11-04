<script lang="ts">
import { open } from "@tauri-apps/plugin-dialog";
import { tick } from "svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import { appContext } from "$lib/stores/state.svelte";
import { MARKDOWN_EXTENSIONS } from "$lib/utils/fileValidation";
import type { SettingDef } from "$lib/utils/settingsDefinitions";
import { elideMiddle } from "$lib/utils/textElide";
import DictionarySelector from "./DictionarySelector.svelte";
import Input from "./Input.svelte";

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

let path = $derived(value ? String(value) : "");
let pathContainer = $state<HTMLDivElement>();
let pathSpan = $state<HTMLSpanElement>();
let displayPath = $state($_("settings.noTemplateSelected"));
let tooltipText = $derived(setting.tooltip ? $_(setting.tooltip) : null);
let resolvedDefaultAccent = $state("#000000");
// The native spinner uses `min` as its step base, so an off-grid min (e.g. -1
// with step 50) shifts the step grid and makes it jump by one. Align the input's
// min down to a step multiple; handleNumberBlur re-clamps to the true minimum.
let numberInputMin = $derived(
  setting.min === undefined ? undefined : Math.floor(setting.min / (setting.step ?? 1)) * (setting.step ?? 1),
);

$effect(() => {
  if (setting.type !== "color") return;
  void appContext.settings.theme;
  void appContext.settings.activeTheme;
  const system = appContext.settings.systemAccentColor;
  const brand = getComputedStyle(document.documentElement).getPropertyValue("--color-brand-accent").trim();
  resolvedDefaultAccent =
    system || (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(brand) ? brand.toLowerCase() : "#7c5a73");
});

function parseNumber(raw: string): number | null {
  const parsed = Number(raw);
  return raw.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
}

function clampNumber(number: number): number {
  const min = setting.min ?? Number.NEGATIVE_INFINITY;
  const max = setting.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, number));
}

function handleNumberInput(e: Event) {
  const parsed = parseNumber((e.currentTarget as HTMLInputElement).value);
  // Leave incomplete ("-", "") and out-of-range values alone while typing:
  // clamping the first digit of "14" to 8 would make the rest untypable.
  if (parsed === null) return;
  if (setting.min !== undefined && parsed < setting.min) return;
  if (setting.max !== undefined && parsed > setting.max) return;
  onChange(parsed);
}

function handleNumberBlur(e: Event) {
  const el = e.currentTarget as HTMLInputElement;
  const parsed = parseNumber(el.value);
  const defaultValue = Number(setting.defaultValue);
  const fallback = Number.isFinite(defaultValue) ? defaultValue : 0;
  const current = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const normalized = clampNumber(parsed ?? current);
  onChange(normalized);
  // The spinner's aligned minimum can differ from the real one, so write the
  // clamped value back after Svelte has applied it.
  void tick().then(() => {
    if (el.value !== String(normalized)) el.value = String(normalized);
  });
}

function measureCharWidth(el: HTMLElement): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = getComputedStyle(el).font;
  return ctx.measureText("M").width;
}

function fitPathToWidth() {
  const span = pathSpan;
  if (!span) return;
  if (!path) {
    displayPath = $_("settings.noTemplateSelected");
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
  if (setting.type !== "file") return;
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
  if (setting.type !== "file") return;
  fitPathToWidth();
});
</script>

<div use:tooltip={setting.type === "file" ? null : tooltipText} class="w-full">
  {#if setting.type === "text"}
    <Input
      id={setting.key}
      type="text"
      value={String(value ?? setting.defaultValue)}
      oninput={(e) => onChange(e.currentTarget.value)}
    />
  {:else if setting.type === "number"}
    <div class={setting.unit ? "flex items-center gap-2" : "w-full"}>
      <Input
        id={setting.key}
        type="number"
        value={Number(value ?? setting.defaultValue)}
        min={numberInputMin}
        max={setting.max}
        step={setting.step}
        oninput={handleNumberInput}
        onblur={handleNumberBlur}
        class={setting.unit ? "min-w-0 flex-1" : ""}
      />
      {#if setting.unit}
        <span class="text-ui-sm text-fg-muted shrink-0 font-mono opacity-80">
          {$_(setting.unit)}
        </span>
      {/if}
    </div>
  {:else if setting.type === "range"}
    <div class="flex items-center gap-3">
      <input
        id={setting.key}
        type="range"
        value={Number(value ?? setting.defaultValue)}
        min={setting.min}
        max={setting.max}
        step={setting.step}
        oninput={(e) => onChange(Number(e.currentTarget.value))}
        class="bg-border-primary accent-accent-primary h-1.5 flex-1 appearance-none rounded-full"
      >
      <span class="text-ui-sm text-fg-muted w-10 text-right font-mono opacity-80">
        {Number(value ?? setting.defaultValue)}%
      </span>
    </div>
  {:else if setting.type === "boolean"}
    <input
      id={setting.key}
      type="checkbox"
      role="switch"
      checked={Boolean(value ?? setting.defaultValue)}
      aria-checked={Boolean(value ?? setting.defaultValue)}
      onchange={(e) => onChange(e.currentTarget.checked)}
    >
  {:else if setting.type === "color"}
    {@const displayColor = String(value ?? "") || resolvedDefaultAccent}
    <div class="flex items-center gap-2">
      <label class="relative block h-7 w-10 shrink-0 overflow-hidden rounded border border-border-primary">
        <input
          id={setting.key}
          type="color"
          value={displayColor}
          oninput={(e) => onChange(e.currentTarget.value)}
          class="absolute inset-0 h-full w-full opacity-0"
        >
        <span class="block h-full w-full" style:background={displayColor}></span>
      </label>
      {#if value}
        <button type="button" class="btn-ghost btn-sm" onclick={() => onChange("")}>
          {$_("common.resetToDefault")}
        </button>
      {/if}
    </div>
  {:else if setting.type === "select"}
    <select
      id={setting.key}
      value={String(value ?? setting.defaultValue)}
      onchange={(e) => onChange(e.currentTarget.value)}
      class="w-full"
    >
      {#each setting.options || [] as option, idx (option)}
        <option value={option}>
          {setting.getOptionLabel?.(option) ?? (setting.optionLabels?.[idx] ? $_(setting.optionLabels[idx]) : option)}
        </option>
      {/each}
    </select>
  {:else if setting.type === "dictionary-multi-select"}
    <div>
      <DictionarySelector selected={value as string[]} onChange={(dicts) => onChange(dicts)} />
    </div>
  {:else if setting.type === "custom-context-menu"}
    <input
      id={setting.key}
      type="checkbox"
      role="switch"
      checked={isContextMenuEnabled}
      aria-checked={isContextMenuEnabled}
      onchange={(e) => onToggleContextMenu?.(e.currentTarget.checked)}
      disabled={isCheckingContextMenu}
    >
  {:else if setting.type === "file"}
    <div class="w-full min-w-0" bind:this={pathContainer}>
      <div class="flex items-center gap-2" use:tooltip={tooltipText}>
        <button
          type="button"
          class="btn-base btn-sm btn-primary whitespace-nowrap"
          onclick={async () => {
            const selected = await open({
              multiple: false,
              filters: [{ name: $_("fileOps.markdownFilter"), extensions: MARKDOWN_EXTENSIONS }],
            });
            if (selected && typeof selected === "string") {
              onChange(selected);
            }
          }}
        >
          {$_("common.browse")}
        </button>
        {#if value}
          <button type="button" class="btn-base btn-sm whitespace-nowrap" onclick={() => onChange("")}>
            {$_("common.clear")}
          </button>
        {/if}
      </div>
      <span
        bind:this={pathSpan}
        use:tooltip={path || null}
        class="text-ui text-fg-muted mt-1 block w-full truncate font-mono"
      >
        {displayPath}
      </span>
    </div>
  {/if}
</div>
