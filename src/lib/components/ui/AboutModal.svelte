<script lang="ts">
import { openPath } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-svelte';
import { _ } from 'svelte-i18n';
import Modal from '$lib/components/ui/Modal.svelte';
import { translate } from '$lib/i18n';
import type { AppInfo } from '$lib/types/api';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    position?: 'center' | 'top';
}

let { isOpen = $bindable(false), onClose, position = 'top' }: Props = $props();

let isChecking = $state(false);
let updateStatus = $state<string | null>(null);

let appInfo = $state<AppInfo>({
    name: 'MarkdownRS',
    version: '...',
    install_path: '',
    data_path: '',
    cache_path: '',
    logs_path: '',
    log_file_path: '',
    os_platform: '',
});

$effect(() => {
    callBackend('get_app_info', {}, 'File:Metadata')
        .then((info) => {
            if (info) {
                appInfo = info;
            }
        })
        .catch(() => {
            // Error handled by bridge
        });
});

function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
}

async function openLogFile() {
    if (!appInfo.log_file_path) return;
    try {
        await openPath(appInfo.log_file_path);
    } catch (_e) {
        await openPath(appInfo.logs_path);
    }
}

async function checkForUpdates() {
    if (isChecking) return;
    isChecking = true;
    updateStatus = translate('about.checking');

    try {
        const update = await check();

        if (update) {
            updateStatus = translate('about.downloading', { values: { version: update.version } });
            await update.downloadAndInstall();
            updateStatus = translate('about.restarting');
            await relaunch();
        } else {
            updateStatus = translate('about.upToDate');
        }
    } catch (_err) {
        updateStatus = translate('about.checkFailed');
    } finally {
        isChecking = false;
        if (updateStatus !== translate('about.restarting')) {
            setTimeout(() => {
                updateStatus = null;
            }, CONFIG.UI_TIMING.UPDATE_STATUS_HIDE_MS);
        }
    }
}
</script>

<Modal bind:isOpen {onClose} {position} title={$_('about.title')}>
    <div class="text-ui flex flex-col items-center gap-4 p-6">
        <img src="/logo.svg" alt={$_('app.logoAlt')} class="h-20 w-20" />
        <h1 class="text-fg-default text-2xl font-bold">{appInfo.name}</h1>
        <p class="text-fg-muted">{$_('app.tagline')}</p>
        <p class="text-accent-secondary text-center italic">
            "{$_('app.quote')}"
        </p>

        <div class="mt-4 w-full space-y-2">
            <div class="bg-bg-panel flex items-center gap-3 rounded-lg px-3 py-2.5">
                <span class="text-fg-muted w-16 shrink-0 font-medium">{$_('about.version')}</span>
                <span class="text-fg-default flex-1 text-left font-mono font-bold"
                    >{appInfo.version}</span
                >
                <button
                    type="button"
                    class="text-ui-sm bg-bg-input text-fg-default border-border-light flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 transition-colors"
                    onclick={checkForUpdates}
                    disabled={isChecking}>
                    {#if isChecking}
                        <LoaderCircle size={12} class="animate-spin" />
                    {:else}
                        <RefreshCw size={12} />
                    {/if}
                    <span>{$_('about.update')}</span>
                </button>
            </div>

            <div class="bg-bg-panel flex items-center gap-3 rounded-lg px-3 py-2.5">
                <span class="text-fg-muted w-16 shrink-0 font-medium">{$_('common.install')}</span>
                <span
                    class="text-ui-sm text-fg-default flex-1 truncate text-left font-mono"
                    title={appInfo.install_path}
                    >{appInfo.install_path}</span
                >
                <button
                    type="button"
                    class="text-ui-sm text-accent-primary hover-surface shrink-0 rounded px-2 py-0.5"
                    onclick={() => copyToClipboard(appInfo.install_path)}>
                    {$_('common.copy')}
                </button>
            </div>

            <div class="bg-bg-panel flex items-center gap-3 rounded-lg px-3 py-2.5">
                <span class="text-fg-muted w-16 shrink-0 font-medium">{$_('about.data')}</span>
                <span
                    class="text-ui-sm text-fg-default flex-1 truncate text-left font-mono"
                    title={appInfo.data_path}
                    >{appInfo.data_path}</span
                >
                <button
                    type="button"
                    class="text-ui-sm text-accent-primary hover-surface shrink-0 rounded px-2 py-0.5"
                    onclick={() => copyToClipboard(appInfo.data_path)}>
                    {$_('common.copy')}
                </button>
            </div>

            <div class="bg-bg-panel flex items-center gap-3 rounded-lg px-3 py-2.5">
                <span class="text-fg-muted w-16 shrink-0 font-medium">{$_('about.cache')}</span>
                <span
                    class="text-ui-sm text-fg-default flex-1 truncate text-left font-mono"
                    title={appInfo.cache_path}
                    >{appInfo.cache_path}</span
                >
                <button
                    type="button"
                    class="text-ui-sm text-accent-primary hover-surface shrink-0 rounded px-2 py-0.5"
                    onclick={() => copyToClipboard(appInfo.cache_path)}>
                    {$_('common.copy')}
                </button>
            </div>

            <div class="bg-bg-panel flex items-center gap-3 rounded-lg px-3 py-2.5">
                <span class="text-fg-muted w-16 shrink-0 font-medium">{$_('about.logs')}</span>
                <span
                    class="text-ui-sm text-fg-default flex-1 truncate text-left font-mono"
                    title={appInfo.logs_path}
                    >{appInfo.logs_path}</span
                >
                <button
                    type="button"
                    class="text-ui-sm text-accent-primary hover-surface shrink-0 rounded px-2 py-0.5"
                    onclick={() => copyToClipboard(appInfo.logs_path)}>
                    {$_('common.copy')}
                </button>
            </div>
        </div>

        <button
            type="button"
            class="text-ui-sm text-accent-link hover:text-accent-link-hover flex items-center gap-1.5 transition-colors hover:underline"
            onclick={openLogFile}>
            <span>{$_('about.openLogFile')}</span>
            <ExternalLink size={12} />
        </button>

        {#if updateStatus}
            <div class="text-ui-sm text-accent-primary py-1 text-center">
                {updateStatus}
            </div>
        {/if}

        <div class="mt-4 text-center text-xs">
            <p class="text-fg-muted">{$_('app.giants')}</p>
            <p class="text-fg-muted mt-1">{$_('app.rights')}</p>
        </div>
    </div>
</Modal>
