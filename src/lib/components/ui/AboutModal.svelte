<script lang="ts">
    import { callBackend } from '$lib/utils/backend';
    import { openPath } from '@tauri-apps/plugin-opener';
    import { relaunch } from '@tauri-apps/plugin-process';
    import { check } from '@tauri-apps/plugin-updater';
    import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-svelte';
    import Modal from './Modal.svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    interface AppInfo {
        name: string;
        version: string;
        install_path: string;
        data_path: string;
        cache_path: string;
        logs_path: string;
        os_platform: string;
    }

    let appInfo = $state<AppInfo>({
        name: 'MarkdownRS',
        version: '...',
        install_path: '',
        data_path: '',
        cache_path: '',
        logs_path: '',
        os_platform: '',
    });

    let isChecking = $state(false);
    let updateStatus = $state<string | null>(null);

    // Replaces onMount for initial data fetch
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
        if (!appInfo.logs_path) return;
        const separator = appInfo.os_platform === 'windows' ? '\\' : '/';
        const logFile = `${appInfo.logs_path}${separator}markdown-rs.log`;
        try {
            await openPath(logFile);
        } catch (e) {
            console.error('Failed to open log file, opening directory instead:', e);
            await openPath(appInfo.logs_path);
        }
    }

    async function checkForUpdates() {
        if (isChecking) return;
        isChecking = true;
        updateStatus = 'Checking for updates...';

        try {
            const update = await check();
            if (update) {
                const confirmed = confirm(
                    `Update available: ${update.version}\n\n${update.body || 'No release notes available.'}\n\nDo you want to install it now?`,
                );

                if (confirmed) {
                    updateStatus = 'Downloading and installing...';
                    await update.downloadAndInstall();
                    updateStatus = 'Restarting...';
                    await relaunch();
                } else {
                    updateStatus = 'Update cancelled.';
                }
            } else {
                updateStatus = 'You are up to date.';
            }
        } catch (err) {
            console.error('Update check failed:', err);
            updateStatus = 'Failed to check for updates.';
        } finally {
            isChecking = false;
            if (updateStatus !== 'Restarting...') {
                setTimeout(() => {
                    updateStatus = null;
                }, 3000);
            }
        }
    }
</script>

<Modal bind:isOpen {onClose} title="About">
    <div class="text-ui flex flex-col items-center gap-4 p-6">
        <img src="/logo.svg" alt="MarkdownRS Logo" class="h-20 w-20" />
        <h1 class="text-fg-default text-2xl font-bold">{appInfo.name}</h1>
        <p class="text-fg-muted">The only markdown editor you need.</p>
        <p class="text-accent-secondary text-center italic">
            "I didn't get where I am today...<br /> without knowing a damned fine editor when I see one."
        </p>

        <div class="mt-4 w-full space-y-1">
            <div class="border-border-main flex items-center gap-3 border-b py-2">
                <span class="text-fg-muted w-16 shrink-0 font-medium">Version</span>
                <span class="text-fg-default flex-1 text-left font-mono font-bold"
                    >{appInfo.version}</span
                >
                <button
                    class="text-ui-sm bg-bg-input text-fg-default border-border-light flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 transition-colors"
                    onclick={checkForUpdates}
                    disabled={isChecking}
                >
                    {#if isChecking}
                        <LoaderCircle size={12} class="animate-spin" />
                    {:else}
                        <RefreshCw size={12} />
                    {/if}
                    <span>Update</span>
                </button>
            </div>

            <div class="border-border-main flex items-center gap-3 border-b py-2">
                <span class="text-fg-muted w-16 shrink-0 font-medium">Install</span>
                <span
                    class="text-ui-sm text-fg-default flex-1 truncate text-left font-mono"
                    title={appInfo.install_path}>{appInfo.install_path}</span
                >
                <button
                    class="text-ui-sm text-accent-primary shrink-0 rounded px-2 py-0.5 hover:bg-white/10"
                    onclick={() => copyToClipboard(appInfo.install_path)}>Copy</button
                >
            </div>

            <div class="border-border-main flex items-center gap-3 border-b py-2">
                <span class="text-fg-muted w-16 shrink-0 font-medium">Data</span>
                <span
                    class="text-ui-sm text-fg-default flex-1 truncate text-left font-mono"
                    title={appInfo.data_path}>{appInfo.data_path}</span
                >
                <button
                    class="text-ui-sm text-accent-primary shrink-0 rounded px-2 py-0.5 hover:bg-white/10"
                    onclick={() => copyToClipboard(appInfo.data_path)}>Copy</button
                >
            </div>

            <div class="border-border-main flex items-center gap-3 border-b py-2">
                <span class="text-fg-muted w-16 shrink-0 font-medium">Cache</span>
                <span
                    class="text-ui-sm text-fg-default flex-1 truncate text-left font-mono"
                    title={appInfo.cache_path}>{appInfo.cache_path}</span
                >
                <button
                    class="text-ui-sm text-accent-primary shrink-0 rounded px-2 py-0.5 hover:bg-white/10"
                    onclick={() => copyToClipboard(appInfo.cache_path)}>Copy</button
                >
            </div>

            <div class="border-border-main flex items-center gap-3 border-b py-2">
                <span class="text-fg-muted w-16 shrink-0 font-medium">Logs</span>
                <span
                    class="text-ui-sm text-fg-default flex-1 truncate text-left font-mono"
                    title={appInfo.logs_path}>{appInfo.logs_path}</span
                >
                <button
                    class="text-ui-sm text-accent-primary shrink-0 rounded px-2 py-0.5 hover:bg-white/10"
                    onclick={() => copyToClipboard(appInfo.logs_path)}>Copy</button
                >
            </div>
        </div>

        <button
            class="text-ui-sm text-accent-link hover:text-accent-link-hover flex items-center gap-1.5 transition-colors hover:underline"
            onclick={openLogFile}
        >
            <span>Open Current Log File</span>
            <ExternalLink size={12} />
        </button>

        {#if updateStatus}
            <div class="text-ui-sm text-accent-primary py-1 text-center">
                {updateStatus}
            </div>
        {/if}

        <div class="mt-4 text-center text-xs">
            <p class="text-fg-muted">
                Giants' Shoulders = Node / Vite / Rust / Tauri / Svelte / Tailwind
            </p>
            <p class="text-fg-muted mt-1">© MarkdownRS since 2025. All rights reserved.</p>
        </div>
    </div>
</Modal>
