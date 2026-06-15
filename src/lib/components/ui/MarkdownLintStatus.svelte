<script lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-svelte';
import { tooltip } from '$lib/actions/tooltip';
import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
import { markdownLintState } from '$lib/utils/markdownLint.svelte.ts';

let showPopup = $state(false);
let buttonEl = $state<HTMLButtonElement>();

let color = $derived.by(() => {
    switch (markdownLintState.highestSeverity) {
        case 'error': return 'text-danger';
        case 'warning': return 'text-warning';
        case 'info': return 'text-accent-secondary';
        case 'clean': return 'text-fg-muted';
    }
});

let displayCount = $derived(markdownLintState.issueCount > 0 ? String(markdownLintState.issueCount) : '');

function severityIcon(severity: string) {
    if (severity === 'error') return CircleAlert;
    if (severity === 'warning') return TriangleAlert;
    return Info;
}

function severityColor(severity: string) {
    if (severity === 'error') return 'text-danger';
    if (severity === 'warning') return 'text-warning';
    return 'text-accent-secondary';
}
</script>

<button
    bind:this={buttonEl}
    type="button"
    class="hover:text-fg-default hover-surface relative flex cursor-pointer items-center gap-1 rounded px-1 transition-colors {color}"
    use:tooltip={'Markdown Lint Issues'}
    onclick={() => (showPopup = true)}>
    {#if markdownLintState.highestSeverity === 'error'}
        <CircleAlert size={14} />
    {:else if markdownLintState.highestSeverity === 'warning'}
        <TriangleAlert size={14} />
    {:else if markdownLintState.highestSeverity === 'info'}
        <Info size={14} />
    {:else}
        <CircleCheck size={14} />
    {/if}
    {#if displayCount}
        <span class="font-mono text-xs">{displayCount}</span>
    {/if}
</button>

{#if showPopup && buttonEl}
    {@const rect = buttonEl.getBoundingClientRect()}
    <ContextMenu x={rect.left} y={rect.bottom + 2} onClose={() => (showPopup = false)}>
        {#snippet children(_: { submenuSide: 'left' | 'right' })}
            <div class="min-w-72">
                <div class="border-border-light border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    Markdown Lint Issues
                    <span class="text-fg-muted ml-1 font-normal normal-case tracking-normal">
                        ({markdownLintState.issueCount})
                    </span>
                </div>
                {#if markdownLintState.diagnostics.length === 0}
                    <div class="px-3 py-4 text-center text-sm text-fg-muted">
                        No issues found
                    </div>
                {:else}
                    <div class="max-h-80 overflow-y-auto">
                        {#each markdownLintState.diagnostics as diag, i}
                            {@const Icon = severityIcon(diag.severity)}
                            <button
                                type="button"
                                class="hover-surface flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm transition-colors">
                                <Icon size={14} class="mt-0.5 shrink-0 {severityColor(diag.severity)}" />
                                <div class="min-w-0 flex-1">
                                    <span class="font-mono text-xs text-fg-muted">
                                        Ln {diag.line}
                                    </span>
                                    <p class="truncate text-fg-default">
                                        {diag.message}
                                    </p>
                                </div>
                            </button>
                            {#if i < markdownLintState.diagnostics.length - 1}
                                <div class="border-border-light border-t"></div>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </div>
        {/snippet}
    </ContextMenu>
{/if}
