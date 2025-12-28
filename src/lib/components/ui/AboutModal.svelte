<script lang="ts">
    import { callBackend } from "$lib/utils/backend";
    import { relaunch } from "@tauri-apps/plugin-process";
    import { check } from "@tauri-apps/plugin-updater";
    import { LoaderCircle, RefreshCw } from "lucide-svelte";
    import { onMount } from "svelte";
    import Modal from "./Modal.svelte";

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
    }

    let appInfo = $state<AppInfo>({
        name: "MarkdownRS",
        version: "...",
        install_path: "",
        data_path: "",
        cache_path: "",
        logs_path: "",
    });

    let isChecking = $state(false);
    let updateStatus = $state<string | null>(null);

    onMount(async () => {
        try {
            const info = await callBackend("get_app_info", {}, "File:Metadata");
            appInfo = info;
        } catch (err) {
            // Error handled by bridge
        }
    });

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

    async function checkForUpdates() {
        if (isChecking) return;
        isChecking = true;
        updateStatus = "Checking for updates...";

        try {
            const update = await check();
            if (update?.available) {
                const confirmed = confirm(`Update available: ${update.version}\n\n${update.body || "No release notes available."}\n\nDo you want to install it now?`);

                if (confirmed) {
                    updateStatus = "Downloading and installing...";
                    await update.downloadAndInstall();
                    updateStatus = "Restarting...";
                    await relaunch();
                } else {
                    updateStatus = "Update cancelled.";
                }
            } else {
                updateStatus = "You are up to date.";
            }
        } catch (err) {
            console.error("Update check failed:", err);
            updateStatus = "Failed to check for updates.";
        } finally {
            isChecking = false;
            if (updateStatus !== "Restarting...") {
                setTimeout(() => {
                    updateStatus = null;
                }, 3000);
            }
        }
    }
</script>

<Modal bind:isOpen {onClose} title="About" width="500px">
    <div class="p-6 flex flex-col items-center gap-4 text-ui">
        <img src="/logo.svg" alt="MarkdownRS Logo" class="w-20 h-20" />
        <h1 class="text-2xl font-bold text-fg-default">{appInfo.name}</h1>
        <p class="text-fg-muted">The only markdown editor you need.</p>
        <p class="italic text-center text-accent-secondary">"I didn't get where I am today...<br /> without knowing a damned fine editor when I see one."</p>

        <div class="w-full mt-4 space-y-1">
            <div class="flex items-center py-2 border-b gap-3 border-border-main">
                <span class="font-medium shrink-0 w-16 text-fg-muted">Version</span>
                <span class="font-mono font-bold flex-1 text-left text-fg-default">{appInfo.version}</span>
                <button class="text-ui-sm px-2 py-0.5 rounded flex items-center gap-1 transition-colors border shrink-0 bg-bg-input text-fg-default border-border-light" onclick={checkForUpdates} disabled={isChecking}>
                    {#if isChecking}
                        <LoaderCircle size={12} class="animate-spin" />
                    {:else}
                        <RefreshCw size={12} />
                    {/if}
                    <span>Update</span>
                </button>
            </div>

            <div class="flex items-center py-2 border-b gap-3 border-border-main">
                <span class="font-medium shrink-0 w-16 text-fg-muted">Install</span>
                <span class="text-ui-sm font-mono truncate flex-1 text-left text-fg-default" title={appInfo.install_path}>{appInfo.install_path}</span>
                <button class="text-ui-sm px-2 py-0.5 rounded hover:bg-white/10 shrink-0 text-accent-primary" onclick={() => copyToClipboard(appInfo.install_path)}>Copy</button>
            </div>

            <div class="flex items-center py-2 border-b gap-3 border-border-main">
                <span class="font-medium shrink-0 w-16 text-fg-muted">Data</span>
                <span class="text-ui-sm font-mono truncate flex-1 text-left text-fg-default" title={appInfo.data_path}>{appInfo.data_path}</span>
                <button class="text-ui-sm px-2 py-0.5 rounded hover:bg-white/10 shrink-0 text-accent-primary" onclick={() => copyToClipboard(appInfo.data_path)}>Copy</button>
            </div>

            <div class="flex items-center py-2 border-b gap-3 border-border-main">
                <span class="font-medium shrink-0 w-16 text-fg-muted">Cache</span>
                <span class="text-ui-sm font-mono truncate flex-1 text-left text-fg-default" title={appInfo.cache_path}>{appInfo.cache_path}</span>
                <button class="text-ui-sm px-2 py-0.5 rounded hover:bg-white/10 shrink-0 text-accent-primary" onclick={() => copyToClipboard(appInfo.cache_path)}>Copy</button>
            </div>

            <div class="flex items-center py-2 border-b gap-3 border-border-main">
                <span class="font-medium shrink-0 w-16 text-fg-muted">Logs</span>
                <span class="text-ui-sm font-mono truncate flex-1 text-left text-fg-default" title={appInfo.logs_path}>{appInfo.logs_path}</span>
                <button class="text-ui-sm px-2 py-0.5 rounded hover:bg-white/10 shrink-0 text-accent-primary" onclick={() => copyToClipboard(appInfo.logs_path)}>Copy</button>
            </div>
        </div>

        {#if updateStatus}
            <div class="text-center text-ui-sm py-1 text-accent-primary">
                {updateStatus}
            </div>
        {/if}

        <div class="mt-4 text-center text-ui-sm">
            <p class="text-fg-muted">Giants' Shoulders = Rust / Tauri + Vite / Svelte / Tailwind</p>
            <p class="mt-1 text-fg-muted">© MarkdownRS. All rights reserved.</p>
        </div>
    </div>
</Modal>
