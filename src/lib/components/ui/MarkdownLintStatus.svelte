<script lang="ts">
import { CircleAlert, CircleCheck, ClipboardCopy, Info, TriangleAlert } from 'lucide-svelte';
import { _ } from 'svelte-i18n';
import { tooltip } from '$lib/actions/tooltip';
import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
import { translate } from '$lib/i18n';
import { appContext } from '$lib/stores/state.svelte';
import type { LintDiagnostic } from '$lib/types/api';
import { callBackendSafe } from '$lib/utils/backend';
import { markdownLintState } from '$lib/utils/markdownLint.svelte';

const severityMap: Record<string, { icon: typeof CircleAlert; color: string }> = {
  error: { icon: CircleAlert, color: 'text-danger' },
  warning: { icon: TriangleAlert, color: 'text-warning' },
  info: { icon: Info, color: 'text-accent-secondary' },
};

let showPopup = $state(false);
let buttonEl = $state<HTMLButtonElement>();

let severityEntry = $derived(severityMap[markdownLintState.highestSeverity]);
let color = $derived(severityEntry?.color ?? 'text-fg-muted');

let displayCount = $derived(markdownLintState.issueCount > 0 ? String(markdownLintState.issueCount) : '');

let markdownDiags = $derived(markdownLintState.diagnostics.filter((d) => d.source !== 'harper'));
let grammarDiags = $derived(markdownLintState.diagnostics.filter((d) => d.source === 'harper'));

let configPath = $state<string | null>(null);
let copied = $state(false);

$effect(() => {
  if (showPopup) {
    configPath = null;
    copied = false;
    fetchConfigPath();
  }
});

async function fetchConfigPath() {
  const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
  const filePath = activeTab?.path;
  configPath = await callBackendSafe('get_rumdl_config_path', { filePath: filePath ?? undefined }, 'Markdown:Lint', {
    showToast: false,
  });
}

async function copyConfigPath() {
  if (!configPath) return;
  await navigator.clipboard.writeText(configPath);
  copied = true;
  setTimeout(() => (copied = false), 1500);
}
</script>

<button
  bind:this={buttonEl}
  type="button"
  class="hover:text-fg-default hover-surface relative flex cursor-pointer items-center gap-1 rounded px-1 transition-colors {color}"
  use:tooltip={$_('lint.title')}
  onclick={() => (showPopup = true)}
>
  {#if severityEntry}
    {@const Icon = severityEntry.icon}
    <Icon size={14} />
  {:else}
    <CircleCheck size={14} />
  {/if}
  {#if displayCount}
    <span class="font-mono text-xs">{displayCount}</span>
  {/if}
</button>

{#snippet issueSection(title: string, diags: LintDiagnostic[])}
  <div class="border-border-light border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
    {title}
    <span class="text-fg-muted ml-1 font-normal normal-case tracking-normal"> ({diags.length}) </span>
  </div>
  {#each diags as diag, i}
    {@const entry = severityMap[diag.severity] ?? severityMap.info}
    {@const Icon = entry.icon}
    <button
      type="button"
      class="hover-surface flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm transition-colors"
    >
      <Icon size={14} class="mt-0.5 shrink-0 {entry.color}" />
      <div class="min-w-0 flex-1">
        <span class="font-mono text-xs text-fg-muted"> {translate('statusBar.ln')} {diag.line} </span>
        <p class="truncate text-fg-default">
          {diag.message}
        </p>
      </div>
    </button>
    {#if i < diags.length - 1}
      <div class="border-border-light border-t"></div>
    {/if}
  {/each}
{/snippet}

{#if showPopup && buttonEl}
  {@const rect = buttonEl.getBoundingClientRect()}
  <ContextMenu x={rect.left} y={rect.bottom + 2} onClose={() => (showPopup = false)}>
    {#snippet children(_: { submenuSide: 'left' | 'right' })}
      <div class="min-w-72">
        <div
          class="border-border-light border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"
        >
          {translate('lint.title')}
          <span class="text-fg-muted ml-1 font-normal normal-case tracking-normal">
            ({markdownLintState.issueCount})
          </span>
        </div>
        {#if markdownLintState.diagnostics.length === 0}
          <div class="px-3 py-4 text-center text-sm text-fg-muted">
            {translate('lint.noIssues')}
          </div>
        {:else}
          <div class="max-h-80 overflow-y-auto">
            {#if markdownDiags.length > 0}
              {@render issueSection(translate('lint.issuesTitle'), markdownDiags)}
            {/if}
            {#if grammarDiags.length > 0}
              {@render issueSection(translate('lint.grammarTitle'), grammarDiags)}
            {/if}
          </div>
        {/if}
        <div class="border-border-light flex items-center gap-1 border-t px-3 py-1.5">
          <span class="text-fg-muted text-[10px]">
            {translate('lint.rumdlLabel')}: {configPath ?? translate('lint.noConfigFile')}
          </span>
          {#if configPath}
            <button
              type="button"
              class="hover:text-fg-default shrink-0 transition-colors"
              onclick={copyConfigPath}
              title={translate('lint.copyConfigPath')}
            >
              <ClipboardCopy size={10} class={copied ? 'text-accent' : 'text-fg-muted'} />
            </button>
          {/if}
          <button
            type="button"
            class="text-accent-primary hover-surface ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-colors"
            onclick={() => {
                            showPopup = false;
                            appContext.interface.showRumdlConfig = true;
                        }}
          >
            {translate('lint.editConfig')}
          </button>
        </div>
      </div>
    {/snippet}
  </ContextMenu>
{/if}
