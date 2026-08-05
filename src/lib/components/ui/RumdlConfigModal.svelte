<script lang="ts">
import { Settings2, X } from 'lucide-svelte';
import { untrack } from 'svelte';
import { _ } from 'svelte-i18n';
import Modal from '$lib/components/ui/Modal.svelte';
import { translate } from '$lib/i18n';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { getEditorInstance } from '$lib/utils/editorCommands';
import { AppError } from '$lib/utils/errorHandling';
import { forceMarkdownRelint } from '$lib/utils/markdownLintExtension.svelte';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

let { isOpen = $bindable(false), onClose }: Props = $props();

let busy = $state(false);
let loaded = $state(false);
let targetPath = $state('');
let exists = $state(false);
let loadedPath = $state<string | null>(null);
let content = $state('');
let hasChanges = $state(false);
let scope = $state<'project' | 'user'>('project');

function activeTab() {
    return appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
}

$effect(() => {
    if (!isOpen) return;
    untrack(() => {
        scope = activeTab()?.path ? 'project' : 'user';
        void loadConfig();
    });
});

async function setScope(next: 'project' | 'user') {
    if (next === scope) return;
    scope = next;
    await loadConfig();
}

async function loadConfig() {
    busy = true;
    loaded = false;
    try {
        const filePath = activeTab()?.path;
        const result = await callBackend(
            'read_rumdl_config',
            { filePath: filePath ?? undefined, target: scope },
            'Markdown:ReadRumdlConfig',
        );
        if (result) {
            targetPath = result.target_path;
            exists = result.exists;
            loadedPath = result.loaded_path;
            content = result.content;
            hasChanges = false;
        }
    } catch (err) {
        AppError.handle('Markdown:ReadRumdlConfig', err, { showToast: true });
    } finally {
        busy = false;
        loaded = true;
    }
}

async function saveConfig() {
    if (busy) return;
    busy = true;
    try {
        const filePath = activeTab()?.path;
        const written = await callBackend(
            'write_rumdl_config',
            { filePath: filePath ?? undefined, target: scope, content },
            'Markdown:WriteRumdlConfig',
        );
        if (written === null) return;
        hasChanges = false;
        showToast('success', translate('rumdlConfig.saved', { values: { path: written } }));
        const tab = activeTab();
        const view = tab?.id ? getEditorInstance(tab.id) : undefined;
        if (view) forceMarkdownRelint(view);
        onClose();
    } catch (err) {
        AppError.handle('Markdown:WriteRumdlConfig', err, { showToast: true });
    } finally {
        busy = false;
    }
}
</script>

<Modal bind:isOpen {onClose} position="top" width="min(680px, 90vw)">
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Settings2 size={16} class="text-accent-secondary" />
            <h2 class="text-fg-default text-sm font-semibold">{$_('rumdlConfig.title')}</h2>
        </div>
        <button
            type="button"
            class="text-fg-muted hover-surface hover:text-danger rounded p-1 transition-colors outline-none"
            onclick={onClose}
            aria-label={$_('common.close')}>
            <X size={16} />
        </button>
    {/snippet}

    <div class="flex flex-col gap-4 p-6">
        <div class="bg-bg-input border-border-light flex w-max items-center gap-1 rounded border p-1">
            <button
                type="button"
                class="text-ui-sm rounded px-3 py-1 transition-colors {scope === 'project'
                    ? 'bg-accent-primary text-fg-inverse'
                    : 'text-fg-muted hover:text-fg-default'}"
                onclick={() => setScope('project')}
                disabled={busy || !loaded}>
                {translate('rumdlConfig.scopeProject')}
            </button>
            <button
                type="button"
                class="text-ui-sm rounded px-3 py-1 transition-colors {scope === 'user'
                    ? 'bg-accent-primary text-fg-inverse'
                    : 'text-fg-muted hover:text-fg-default'}"
                onclick={() => setScope('user')}
                disabled={busy || !loaded}>
                {translate('rumdlConfig.scopeUser')}
            </button>
        </div>

        <div class="flex items-center gap-2">
            <span class="text-ui-sm text-fg-muted shrink-0">{translate('rumdlConfig.targetLabel')}</span>
            <span class="bg-bg-panel border-border-light text-ui-sm text-fg-default min-w-0 flex-1 truncate rounded border px-2 py-1 font-mono">
                {targetPath}
            </span>
        </div>

        {#if loadedPath && loadedPath !== targetPath}
            <p class="text-ui-sm text-fg-muted">
                {translate('rumdlConfig.currentlyLoaded', { values: { path: loadedPath } })}
            </p>
        {:else if !exists}
            <p class="text-ui-sm text-accent-primary">
                {translate('rumdlConfig.willCreate')}
            </p>
        {/if}

        <textarea
            bind:value={content}
            oninput={() => (hasChanges = true)}
            onkeydown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void saveConfig();
                }
            }}
            spellcheck="false"
            disabled={busy || !loaded}
            placeholder={translate('rumdlConfig.placeholder')}
            class="bg-bg-input text-fg-default text-ui font-mono w-full rounded border p-4 leading-relaxed outline-none disabled:opacity-50 rumdl-config-textarea"></textarea>
    </div>

    {#snippet footer()}
        <button
            type="button"
            class="btn-base btn-sm hover-surface whitespace-nowrap"
            onclick={onClose}
            disabled={busy}>
            {$_('common.cancel')}
        </button>
        <button
            type="button"
            class="btn-base btn-sm bg-accent-primary text-fg-inverse border-transparent font-medium whitespace-nowrap"
            onclick={saveConfig}
            disabled={busy || !loaded || !hasChanges}>
            {$_('common.save')}
        </button>
    {/snippet}
</Modal>

<style>
    .rumdl-config-textarea {
        field-sizing: content;
        min-height: 10rem;
    }

    .rumdl-config-textarea::placeholder {
        color: var(--text-secondary);
        opacity: 0.6;
    }
</style>
