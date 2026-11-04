<script lang="ts">
import CircleAlert from "lucide-svelte/icons/circle-alert";
import CircleCheck from "lucide-svelte/icons/circle-check";
import ClipboardCopy from "lucide-svelte/icons/clipboard-copy";
import Info from "lucide-svelte/icons/info";
import TriangleAlert from "lucide-svelte/icons/triangle-alert";
import { untrack } from "svelte";
import { _ } from "svelte-i18n";
import { portal } from "$lib/actions/portal";
import { tooltip } from "$lib/actions/tooltip";
import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { LINT_SOURCE_HARPER, type LintDiagnostic } from "$lib/types/api";
import { callBackendSafe } from "$lib/utils/backend";
import { getActiveEditorView } from "$lib/utils/editorCommands";
import { markdownLintState } from "$lib/utils/markdownLint.svelte";
import { syncLintStateForTab } from "$lib/utils/markdownLintExtension.svelte";

const severityMap: Record<string, { icon: typeof CircleAlert; color: string }> = {
  error: { icon: CircleAlert, color: "text-danger" },
  warning: { icon: TriangleAlert, color: "text-warning" },
  info: { icon: Info, color: "text-accent-secondary" },
};

let showPopup = $state(false);
let buttonEl = $state<HTMLButtonElement>();

// The popup snippet is nested inside a block, where store subscriptions are
// not allowed, so read the strings at the top level.
let lintLabels = $derived({
  title: $_("lint.title"),
  noIssues: $_("lint.noIssues"),
  issues: $_("lint.issuesTitle"),
  grammar: $_("lint.grammarTitle"),
  rumdl: $_("lint.rumdlLabel"),
  noConfig: $_("lint.noConfigFile"),
  copyPath: $_("lint.copyConfigPath"),
  editConfig: $_("lint.editConfig"),
});

let severityEntry = $derived(severityMap[markdownLintState.highestSeverity]);
let color = $derived(severityEntry?.color ?? "text-fg-muted");

let displayCount = $derived(markdownLintState.issueCount > 0 ? String(markdownLintState.issueCount) : "");

let markdownDiags = $derived(markdownLintState.diagnostics.filter((d) => d.source !== LINT_SOURCE_HARPER));
let grammarDiags = $derived(markdownLintState.diagnostics.filter((d) => d.source === LINT_SOURCE_HARPER));

let configPath = $state<string | null>(null);
let copied = $state(false);

$effect(() => {
  const tabId = appContext.app.activeTabId;
  // Track only the focused tab, not its buffer: sync reads the content and the
  // lint cache, and must not re-run on every keystroke.
  untrack(() => syncLintStateForTab(tabId));
});

$effect(() => {
  if (showPopup) {
    configPath = null;
    copied = false;
    fetchConfigPath();
  }
});

function jumpToDiagnostic(diag: LintDiagnostic): void {
  const view = getActiveEditorView();
  if (!view) return;
  const line = view.state.doc.line(Math.min(Math.max(diag.line, 1), view.state.doc.lines));
  view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
  view.focus();
  showPopup = false;
}

async function fetchConfigPath() {
  const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
  const filePath = activeTab?.path;
  configPath = await callBackendSafe("get_rumdl_config_path", { filePath: filePath ?? undefined }, "Markdown:Lint", {
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
  class="hover:text-fg-default hover-surface relative flex items-center gap-1 rounded px-1 transition-colors {color}"
  use:tooltip={$_("lint.title")}
  onclick={() => (showPopup = true)}
>
  {#if severityEntry}
    {@const Icon = severityEntry.icon}
    <Icon size={14} />
  {:else}
    <CircleCheck size={14} />
  {/if}
  {#if displayCount}
    <span class="font-mono text-ui">{displayCount}</span>
  {/if}
</button>

{#snippet issueSection(title: string, diags: LintDiagnostic[])}
  <div class="border-border-secondary border-b px-3 py-2 text-ui font-semibold uppercase tracking-widest text-fg-muted">
    {title}
    <span class="text-fg-muted ml-1 font-normal normal-case tracking-normal"> ({diags.length}) </span>
  </div>
  {#each diags as diag, i}
    {@const entry = severityMap[diag.severity] ?? severityMap.info}
    {@const Icon = entry.icon}
    <button
      type="button"
      onclick={() => jumpToDiagnostic(diag)}
      class="hover-surface flex w-full items-start gap-2 px-3 py-1.5 text-left text-ui transition-colors"
    >
      <Icon size={14} class="mt-0.5 shrink-0 {entry.color}" />
      <div class="min-w-0 flex-1">
        <span class="font-mono text-ui text-fg-muted"> {$_("statusBar.ln")} {diag.line} </span>
        <p class="truncate text-fg-default">
          {diag.message}
        </p>
      </div>
    </button>
    {#if i < diags.length - 1}
      <div class="border-border-secondary border-t"></div>
    {/if}
  {/each}
{/snippet}

{#if showPopup && buttonEl}
  {@const rect = buttonEl.getBoundingClientRect()}
  <div use:portal>
    <ContextMenu x={rect.left} y={rect.bottom + 2} onClose={() => (showPopup = false)}>
      {#snippet children(_: { submenuSide: "left" | "right" })}
        <div class="text-ui min-w-72">
          <div
            class="border-border-secondary border-b px-3 py-2 text-ui font-semibold uppercase tracking-widest text-fg-muted"
          >
            {lintLabels.title}
            <span class="text-fg-muted ml-1 font-normal normal-case tracking-normal">
              ({markdownLintState.issueCount})
            </span>
          </div>
          {#if markdownLintState.diagnostics.length === 0}
            <div class="px-3 py-4 text-center text-ui text-fg-muted">
              {lintLabels.noIssues}
            </div>
          {:else}
            <div class="custom-scrollbar max-h-80 overflow-y-auto">
              {#if markdownDiags.length > 0}
                {@render issueSection(lintLabels.issues, markdownDiags)}
              {/if}
              {#if grammarDiags.length > 0}
                {@render issueSection(lintLabels.grammar, grammarDiags)}
              {/if}
            </div>
          {/if}
          <div class="border-border-secondary flex items-center gap-1 border-t px-3 py-1.5">
            <span class="text-fg-muted min-w-0 truncate text-[10px]">
              {lintLabels.rumdl}: {configPath ?? lintLabels.noConfig}
            </span>
            {#if configPath}
              <button
                type="button"
                class="hover:text-fg-default shrink-0 transition-colors"
                onclick={copyConfigPath}
                title={lintLabels.copyPath}
              >
                <ClipboardCopy size={10} class={copied ? "text-accent-secondary" : "text-fg-muted"} />
              </button>
            {/if}
            <button
              type="button"
              class="text-accent-secondary hover-surface ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-colors"
              onclick={() => {
                showPopup = false;
                appContext.interface.showRumdlConfig = true;
              }}
            >
              {lintLabels.editConfig}
            </button>
          </div>
        </div>
      {/snippet}
    </ContextMenu>
  </div>
{/if}
