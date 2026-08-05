<script lang="ts">
import { Settings2, X } from 'lucide-svelte';
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

$effect(() => {
    if (!isOpen) return;
    void loadConfig();
});

async function loadConfig() {
    busy = true;
    loaded = false;
    try {
        const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
        const filePath = activeTab?.path;
        const result = await callBackend(
            'read_rumdl_config',
            { filePath: filePath ?? undefined },
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
        const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
        const filePath = activeTab?.path;
        const written = await callBackend(
            'write_rumdl_config',
            { filePath: filePath ?? undefined, content },
            'Markdown:WriteRumdlConfig',
        );
        if (written === null) return;
        hasChanges = false;
        showToast('success', translate('rumdlConfig.saved', { values: { path: written } }));
        const view = activeTab?.id ? getEditorInstance(activeTab.id) : undefined;
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
            <p class="text-ui-sm text-warning">
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
            class="bg-bg-input text-fg-default border-border-main text-ui font-mono min-h-[10rem] w-full rounded border p-4 leading-relaxed outline-none placeholder:text-fg-muted/60 disabled:opacity-50 rumdl-config-textarea"></textarea>
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
    }
</style>
