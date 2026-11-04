<script lang="ts">
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import ExternalLink from "lucide-svelte/icons/external-link";
import LoaderCircle from "lucide-svelte/icons/loader-circle";
import RefreshCw from "lucide-svelte/icons/refresh-cw";
import { _ } from "svelte-i18n";
import Modal from "$lib/components/ui/Modal.svelte";
import { settingsState } from "$lib/stores/settingsState.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import type { AppInfo } from "$lib/types/api";
import { callBackend } from "$lib/utils/backend";
import { CONFIG } from "$lib/utils/config";
import { saveSettings } from "$lib/utils/settings";
import { onLogLevelChange } from "$lib/utils/settingsHandlers";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  position?: "center" | "top";
}

let { isOpen = $bindable(false), onClose, position = "top" }: Props = $props();

let isChecking = $state(false);
let updateStatus = $state<string | null>(null);
let availableVersion = $state<string | null>(null);

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "off"] as const;

const RELEASES_PAGE = "https://github.com/dcog989/MarkdownRS/releases/latest";
const LATEST_RELEASE_API = "https://api.github.com/repos/dcog989/MarkdownRS/releases/latest";

let appInfo = $state<AppInfo>({
  name: "MarkdownRS",
  version: "...",
  install_path: "",
  data_path: "",
  config_path: "",
  cache_path: "",
  logs_path: "",
  log_file_path: "",
  os_platform: "",
  can_self_update: false,
});

$effect(() => {
  callBackend("get_app_info", {}, "File:Metadata")
    .then((info) => {
      if (info) {
        appInfo = info;
      }
    })
    .catch(() => {
      // Error handled by bridge
    });
});

const paths = $derived([
  { labelKey: "common.install", value: appInfo.install_path },
  { labelKey: "about.data", value: appInfo.data_path },
  { labelKey: "about.config", value: appInfo.config_path },
  { labelKey: "about.cache", value: appInfo.cache_path },
  { labelKey: "about.logs", value: appInfo.logs_path },
] as const);

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => showToast("error", $_("common.copyFailed")));
}

async function openLogFile() {
  if (!appInfo.log_file_path) return;
  try {
    await openPath(appInfo.log_file_path);
  } catch (_e) {
    await openPath(appInfo.logs_path);
  }
}

function versionParts(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

async function fetchLatestReleaseVersion(): Promise<string> {
  const response = await fetch(LATEST_RELEASE_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub release check failed: ${response.status}`);
  const data = (await response.json()) as { tag_name?: string };
  if (!data.tag_name) throw new Error("GitHub release has no tag name");
  return data.tag_name;
}

async function checkForUpdates() {
  if (isChecking) return;
  isChecking = true;
  updateStatus = $_("about.checking");
  availableVersion = null;

  try {
    // Non-AppImage Linux installs cannot replace their own binary; report the
    // new version and let the user download it through their package source.
    if (!appInfo.can_self_update) {
      const latest = await fetchLatestReleaseVersion();
      if (isNewerVersion(latest, appInfo.version)) {
        availableVersion = latest;
        updateStatus = $_("about.updateAvailable", { values: { version: latest } });
      } else {
        updateStatus = $_("about.upToDate");
      }
      return;
    }

    const update = await check();

    if (update) {
      updateStatus = $_("about.downloading", { values: { version: update.version } });
      await update.downloadAndInstall();
      updateStatus = $_("about.restarting");
      await relaunch();
    } else {
      updateStatus = $_("about.upToDate");
    }
  } catch (_err) {
    updateStatus = $_("about.checkFailed");
  } finally {
    isChecking = false;
    if (updateStatus !== $_("about.restarting") && !availableVersion) {
      setTimeout(() => {
        updateStatus = null;
      }, CONFIG.UI_TIMING.UPDATE_STATUS_HIDE_MS);
    }
  }
}
</script>

<Modal bind:isOpen {onClose} {position} title={$_("about.title")}>
  <div class="text-ui flex flex-col items-center gap-4 p-6">
    <img src="/logo.svg" alt={$_("app.logoAlt")} class="h-20 w-20">
    <h1 class="text-fg-default text-ui-xlg font-bold">{appInfo.name}</h1>
    <p class="text-fg-muted">{$_("app.tagline")}</p>
    <p class="text-accent-secondary text-center italic">"{$_("app.quote")}"</p>

    <div class="mt-4 w-full space-y-2">
      <div class="bg-bg-panel flex items-center gap-3 rounded-lg px-3 py-2.5">
        <span class="text-fg-muted w-16 shrink-0 font-medium">{$_("about.version")}</span>
        <span class="text-fg-default flex-1 text-left font-mono font-bold">{appInfo.version}</span>
        <button
          type="button"
          class="btn-base btn-sm btn-outline shrink-0"
          onclick={checkForUpdates}
          disabled={isChecking}
        >
          {#if isChecking}
            <LoaderCircle size={12} class="animate-spin" />
          {:else}
            <RefreshCw size={12} />
          {/if}
          <span>{$_("about.update")}</span>
        </button>
      </div>

      {#each paths as path (path.labelKey)}
        <div class="bg-bg-panel flex items-center gap-3 rounded-lg px-3 py-2.5">
          <span class="text-fg-muted w-16 shrink-0 font-medium">{$_(path.labelKey)}</span>
          <span class="text-ui text-fg-default flex-1 truncate text-left font-mono" title={path.value}
            >{path.value}</span
          >
          <button
            type="button"
            class="btn-ghost btn-ghost--accent btn-sm shrink-0"
            onclick={() => copyToClipboard(path.value)}
          >
            {$_("common.copy")}
          </button>
        </div>
      {/each}
    </div>

    <div class="flex items-center gap-3">
      <span class="text-fg-muted shrink-0 font-medium">{$_("settings.logLevel")}:</span>
      <select
        value={settingsState.logLevel}
        title={$_("settings.logLevelTooltip")}
        aria-label={$_("settings.logLevel")}
        onchange={(e) => {
          const level = e.currentTarget.value as (typeof LOG_LEVELS)[number];
          settingsState.logLevel = level;
          saveSettings();
          onLogLevelChange(level);
        }}
      >
        {#each LOG_LEVELS as level (level)}
          <option value={level}>{level}</option>
        {/each}
      </select>

      <button type="button" class="btn-ghost btn-ghost--link btn-sm hover:underline" onclick={openLogFile}>
        <span>{$_("about.openLogFile")}</span>
        <ExternalLink size={12} />
      </button>
    </div>

    {#if updateStatus}
      <div class="text-ui text-accent-secondary py-1 text-center">
        {updateStatus}
      </div>
    {/if}

    {#if availableVersion}
      <button type="button" class="btn-base btn-sm btn-outline" onclick={() => openUrl(RELEASES_PAGE)}>
        <ExternalLink size={12} />
        <span>{$_("about.download")}</span>
      </button>
    {/if}

    <div class="mt-4 text-center text-ui-sm">
      <p class="text-fg-muted">{$_("app.giants")}</p>
      <p class="text-fg-muted mt-1">{$_("app.rights")}</p>
    </div>
  </div>
</Modal>
