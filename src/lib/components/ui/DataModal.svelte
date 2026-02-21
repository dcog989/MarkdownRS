<script lang="ts">
    import { tooltip } from '$lib/actions/tooltip';
    import { showToast } from '$lib/stores/toastStore.svelte';
    import { callBackend } from '$lib/utils/backend';
    import { save, open } from '@tauri-apps/plugin-dialog';
    import { Database, X } from 'lucide-svelte';
    import Modal from './Modal.svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    let busy = $state(false);

    async function exportBookmarks() {
        if (busy) return;
        busy = true;
        try {
            const bookmarks = await callBackend('export_bookmarks', {}, 'Data:ExportBookmarks');
            if (!bookmarks) return;
            const path = await save({
                defaultPath: 'bookmarks.json',
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (!path) return;
            await callBackend(
                'write_text_file',
                { path, content: JSON.stringify(bookmarks, null, 2) },
                'File:Write',
            );
            showToast(
                'success',
                `Exported ${bookmarks.length} bookmark${bookmarks.length === 1 ? '' : 's'}`,
            );
        } catch (err) {
            showToast(
                'error',
                `Export failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        } finally {
            busy = false;
        }
    }

    async function importBookmarks() {
        if (busy) return;
        busy = true;
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (!selected) return;
            const result = await callBackend(
                'read_text_file',
                { path: selected as string },
                'File:Read',
            );
            if (!result) throw new Error('Failed to read file');
            const bookmarks = JSON.parse(result.content);
            if (!Array.isArray(bookmarks)) throw new Error('Invalid format: expected an array');
            const count = await callBackend(
                'import_bookmarks',
                { bookmarks },
                'Data:ImportBookmarks',
            );
            showToast('success', `Imported ${count} bookmark${count === 1 ? '' : 's'}`);
        } catch (err) {
            showToast(
                'error',
                `Import failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        } finally {
            busy = false;
        }
    }

    async function exportRecentFiles() {
        if (busy) return;
        busy = true;
        try {
            const paths = await callBackend('export_recent_files', {}, 'Data:ExportRecent');
            if (!paths) return;
            const dest = await save({
                defaultPath: 'recent-files.json',
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (!dest) return;
            await callBackend(
                'write_text_file',
                { path: dest, content: JSON.stringify(paths, null, 2) },
                'File:Write',
            );
            showToast(
                'success',
                `Exported ${paths.length} recent file${paths.length === 1 ? '' : 's'}`,
            );
        } catch (err) {
            showToast(
                'error',
                `Export failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        } finally {
            busy = false;
        }
    }

    async function importRecentFiles() {
        if (busy) return;
        busy = true;
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (!selected) return;
            const result = await callBackend(
                'read_text_file',
                { path: selected as string },
                'File:Read',
            );
            if (!result) throw new Error('Failed to read file');
            const paths = JSON.parse(result.content);
            if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) {
                throw new Error('Invalid format: expected an array of strings');
            }
            const count = await callBackend('import_recent_files', { paths }, 'Data:ImportRecent');
            showToast('success', `Imported ${count} recent file${count === 1 ? '' : 's'}`);
        } catch (err) {
            showToast(
                'error',
                `Import failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        } finally {
            busy = false;
        }
    }

    async function deleteOrphans() {
        if (busy) return;
        busy = true;
        try {
            const count = await callBackend('delete_orphan_files', {}, 'Data:DeleteOrphans');
            showToast(
                'success',
                `Removed ${count} orphan entr${count === 1 ? 'y' : 'ies'} from history`,
            );
        } catch (err) {
            showToast('error', `Failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            busy = false;
        }
    }

    type Action = {
        label: string;
        description: string;
        handler: () => Promise<void>;
        danger?: boolean;
    };

    const actions: Action[] = [
        {
            label: 'Export Bookmarks',
            description: 'Save all bookmarks to a JSON file.',
            handler: exportBookmarks,
        },
        {
            label: 'Import Bookmarks',
            description: 'Load bookmarks from a JSON file.',
            handler: importBookmarks,
        },
        {
            label: 'Export Recent Files',
            description: 'Save recent file history to a JSON file.',
            handler: exportRecentFiles,
        },
        {
            label: 'Import Recent Files',
            description: 'Load recent file history from a JSON file.',
            handler: importRecentFiles,
        },
        {
            label: 'Delete Orphans',
            description: 'Removes files from history that are no longer on disk.',
            handler: deleteOrphans,
            danger: true,
        },
    ];
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Database size={16} class="text-accent-secondary" />
            <h2 class="text-fg-default text-sm font-semibold">Data</h2>
        </div>
        <button
            class="text-fg-muted hover-surface hover:text-danger rounded p-1 transition-colors outline-none"
            onclick={onClose}
            aria-label="Close">
            <X size={16} />
        </button>
    {/snippet}

    <div class="flex flex-col gap-6 p-6">
        {#each actions as action (action.label)}
            <div class="flex flex-col gap-2 items-start">
                <button
                    class="text-ui bg-bg-input text-fg-default border border-border-main rounded px-4 py-2 text-left outline-none transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40 w-fit"
                    class:text-danger-text={action.danger}
                    onclick={action.handler}
                    disabled={busy}
                    use:tooltip={action.danger
                        ? 'Removes files from history that are no longer on disk.'
                        : ''}>
                    {action.label}
                </button>
                <p class="text-ui-sm text-fg-muted px-1 leading-relaxed">{action.description}</p>
            </div>
        {/each}
    </div>
</Modal>
