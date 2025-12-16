<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { relaunch } from "@tauri-apps/plugin-process";
    import { check } from "@tauri-apps/plugin-updater";
    import { Loader2, RefreshCw, X } from "lucide-svelte";
    import { onMount } from "svelte";

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
    }

    let appInfo = $state<AppInfo>({
        name: "MarkdownRS",
        version: "0.1.52",
        install_path: "",
        data_path: "",
    });

    let isChecking = $state(false);
    let updateStatus = $state<string | null>(null);

    onMount(async () => {
        try {
            const info = await invoke<AppInfo>("get_app_info");
            appInfo = info;
        } catch (err) {
            console.error("Failed to get app info:", err);
        }
    });

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape" && isOpen) {
            e.preventDefault();
            onClose();
        }
    }

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
            // Clear status after 3 seconds if not updating
            if (updateStatus !== "Restarting...") {
                setTimeout(() => {
                    updateStatus = null;
                }, 3000);
            }
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-center justify-center" style="background-color: var(--bg-backdrop);" onclick={handleBackdropClick}>
        <div class="w-[500px] rounded-lg shadow-2xl border overflow-hidden" style="background-color: var(--bg-panel); border-color: var(--border-light);">
            <!-- Header -->
            <div class="flex items-center justify-between px-4 py-3 border-b" style="background-color: var(--bg-header); border-color: var(--border-light);">
                <h2 class="text-base font-semibold" style="color: var(--fg-default);">About</h2>
                <button class="p-1 rounded hover:bg-white/10 transition-colors" style="color: var(--fg-muted);" onclick={onClose} aria-label="Close">
                    <X size={18} />
                </button>
            </div>

            <!-- Content -->
            <div class="p-6 flex flex-col items-center gap-4">
                <img src="/logo.svg" alt="MarkdownRS Logo" class="w-20 h-20" />
                <h1 class="text-2xl font-bold" style="color: var(--fg-default);">{appInfo.name}</h1>
                <p class="text-sm" style="color: var(--fg-muted);">The only markdown editor you need.</p>

                <div class="w-full mt-4 space-y-3">
                    <div class="flex items-center justify-between py-2 border-b" style="border-color: var(--border-main);">
                        <span class="text-sm font-medium" style="color: var(--fg-muted);">Version</span>
                        <div class="flex items-center gap-3">
                            <span class="text-sm font-mono" style="color: var(--fg-default);">{appInfo.version}</span>
                            <button class="text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors" style="background-color: var(--bg-input); color: var(--fg-default); border: 1px solid var(--border-light);" onclick={checkForUpdates} disabled={isChecking}>
                                {#if isChecking}
                                    <Loader2 size={12} class="animate-spin" />
                                    <span>Checking...</span>
                                {:else}
                                    <RefreshCw size={12} />
                                    <span>Check for Updates</span>
                                {/if}
                            </button>
                        </div>
                    </div>

                    {#if updateStatus}
                        <div class="text-center text-xs py-1" style="color: var(--accent-primary);">
                            {updateStatus}
                        </div>
                    {/if}

                    <div class="flex items-start justify-between py-2 border-b" style="border-color: var(--border-main);">
                        <span class="text-sm font-medium" style="color: var(--fg-muted);">Install Path</span>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-mono text-right max-w-[250px] truncate" style="color: var(--fg-default);" title={appInfo.install_path}>{appInfo.install_path}</span>
                            <button class="text-xs px-2 py-1 rounded hover:bg-white/10" style="color: var(--accent-primary);" onclick={() => copyToClipboard(appInfo.install_path)}>Copy</button>
                        </div>
                    </div>

                    <div class="flex items-start justify-between py-2 border-b" style="border-color: var(--border-main);">
                        <span class="text-sm font-medium" style="color: var(--fg-muted);">Data Path</span>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-mono text-right max-w-[250px] truncate" style="color: var(--fg-default);" title={appInfo.data_path}>{appInfo.data_path}</span>
                            <button class="text-xs px-2 py-1 rounded hover:bg-white/10" style="color: var(--accent-primary);" onclick={() => copyToClipboard(appInfo.data_path)}>Copy</button>
                        </div>
                    </div>
                </div>

                <div class="mt-4 text-center">
                    <p class="text-xs" style="color: var(--fg-muted);">Giants' Shoulders = Rust / Tauri + Vite / Svelte</p>
                    <p class="text-xs mt-1" style="color: var(--fg-muted);">© 2025 MarkdownRS. All rights reserved.</p>
                </div>
            </div>
        </div>
    </div>
{/if}
