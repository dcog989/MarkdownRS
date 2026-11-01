<script lang="ts">
import { open, save } from "@tauri-apps/plugin-dialog";
import ArrowLeft from "lucide-svelte/icons/arrow-left";
import Database from "lucide-svelte/icons/database";
import X from "lucide-svelte/icons/x";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import Modal from "$lib/components/ui/Modal.svelte";
import { loadBookmarks, pruneBookmarks } from "$lib/stores/bookmarkStore.svelte";
import { confirmDialog } from "$lib/stores/dialogStore.svelte";
import { clearFileHistory, loadFileHistory, pruneFileHistory } from "$lib/stores/fileHistoryStore.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { callBackend } from "$lib/utils/backend";
import { AppError } from "$lib/utils/errorHandling";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
}

let { isOpen = $bindable(false), onClose, onBack }: Props = $props();

let busy = $state(false);

const MAX_ORPHAN_PATHS_SHOWN = 10;

async function exportBookmarks() {
  if (busy) return;
  busy = true;
  try {
    const bookmarks = await callBackend("get_all_bookmarks", {}, "Data:ExportBookmarks");
    if (!bookmarks) return;
    const path = await save({
      defaultPath: "markdownrs-bookmarks.json",
      filters: [{ name: $_("data.jsonFilter"), extensions: ["json"] }],
    });
    if (!path) return;
    await callBackend("write_text_file", { path, content: JSON.stringify(bookmarks, null, 2) }, "File:Write");
    showToast("success", $_("data.exportedBookmarks", { values: { count: bookmarks.length } }));
  } catch (err) {
    AppError.handle("Data:ExportBookmarks", err, { showToast: true });
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
      filters: [{ name: $_("data.jsonFilter"), extensions: ["json"] }],
    });
    if (!selected) return;
    const result = await callBackend("read_text_file", { path: selected as string }, "File:Read");
    if (!result) throw new Error($_("data.failedToRead"));
    const bookmarks = JSON.parse(result.content);
    if (!Array.isArray(bookmarks)) throw new Error($_("data.invalidFormatArray"));
    const count = await callBackend("import_bookmarks", { bookmarks }, "Data:ImportBookmarks");
    await loadBookmarks();
    showToast("success", $_("data.importedBookmarks", { values: { count } }));
  } catch (err) {
    AppError.handle("Data:ImportBookmarks", err, { showToast: true });
  } finally {
    busy = false;
  }
}

async function exportFileHistory() {
  if (busy) return;
  busy = true;
  try {
    const paths = await callBackend("get_file_history", {}, "Data:ExportFileHistory");
    if (!paths) return;
    const dest = await save({
      defaultPath: "markdownrs-file-history.json",
      filters: [{ name: $_("data.jsonFilter"), extensions: ["json"] }],
    });
    if (!dest) return;
    await callBackend("write_text_file", { path: dest, content: JSON.stringify(paths, null, 2) }, "File:Write");
    showToast("success", $_("data.exportedFiles", { values: { count: paths.length } }));
  } catch (err) {
    AppError.handle("Data:ExportFileHistory", err, { showToast: true });
  } finally {
    busy = false;
  }
}

async function importFileHistory() {
  if (busy) return;
  busy = true;
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: $_("data.jsonFilter"), extensions: ["json"] }],
    });
    if (!selected) return;
    const result = await callBackend("read_text_file", { path: selected as string }, "File:Read");
    if (!result) throw new Error($_("data.failedToRead"));
    const paths = JSON.parse(result.content);
    if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) {
      throw new Error($_("data.invalidFormatStrings"));
    }
    const count = await callBackend("import_file_history", { paths }, "Data:ImportFileHistory");
    await loadFileHistory(true);
    showToast("success", $_("data.importedFiles", { values: { count } }));
  } catch (err) {
    AppError.handle("Data:ImportFileHistory", err, { showToast: true });
  } finally {
    busy = false;
  }
}

async function clearHistory() {
  if (busy) return;
  const result = await confirmDialog({
    title: $_("data.clearFileHistory"),
    message: $_("data.confirmClearFileHistory"),
    saveLabel: undefined,
    discardLabel: $_("common.clear"),
  });
  if (result !== "discard") return;
  busy = true;
  try {
    await clearFileHistory();
    showToast("success", $_("data.clearedFileHistory"));
  } catch (err) {
    AppError.handle("Data:ClearFileHistory", err, { showToast: true });
  } finally {
    busy = false;
  }
}

async function deleteOrphans() {
  if (busy) return;
  busy = true;
  try {
    // A missing file and an unmounted drive look identical on disk, so preview
    // the list and let the user spot paths that are only temporarily away.
    const orphans = await callBackend("delete_orphan_files", { dryRun: true }, "Data:DeleteOrphans");
    if (!orphans) return;
    if (orphans.length === 0) {
      showToast("info", $_("data.noOrphans"));
      return;
    }

    const more = orphans.length - MAX_ORPHAN_PATHS_SHOWN;
    const message = [
      $_("data.confirmDeleteOrphans", { values: { count: orphans.length } }),
      orphans.slice(0, MAX_ORPHAN_PATHS_SHOWN).join("\n"),
      ...(more > 0 ? [$_("data.confirmDeleteOrphansMore", { values: { count: more } })] : []),
    ].join("\n\n");

    const result = await confirmDialog({
      title: $_("data.deleteOrphans"),
      message,
      saveLabel: undefined,
      discardLabel: $_("common.delete"),
    });
    if (result !== "discard") return;

    const deletedPaths = await callBackend(
      "delete_orphan_files",
      { dryRun: false, paths: orphans },
      "Data:DeleteOrphans",
    );
    if (!deletedPaths) return;
    pruneFileHistory(deletedPaths);
    pruneBookmarks(deletedPaths);
    showToast("success", $_("data.removedOrphans", { values: { count: deletedPaths.length } }));
  } catch (err) {
    AppError.handle("Data:DeleteOrphans", err, { showToast: true });
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

const actions = $derived<Action[]>([
  {
    label: $_("data.exportBookmarks"),
    description: $_("data.exportBookmarksDesc"),
    handler: exportBookmarks,
  },
  {
    label: $_("data.importBookmarks"),
    description: $_("data.importBookmarksDesc"),
    handler: importBookmarks,
  },
  {
    label: $_("data.exportFileHistory"),
    description: $_("data.exportFileHistoryDesc"),
    handler: exportFileHistory,
  },
  {
    label: $_("data.importFileHistory"),
    description: $_("data.importFileHistoryDesc"),
    handler: importFileHistory,
  },
  {
    label: $_("data.clearFileHistory"),
    description: $_("data.clearFileHistoryDesc"),
    handler: clearHistory,
    danger: true,
  },
  {
    label: $_("data.deleteOrphans"),
    description: $_("data.deleteOrphansDesc"),
    handler: deleteOrphans,
    danger: true,
  },
]);
</script>

<Modal bind:isOpen {onClose}>
  {#snippet header()}
    <div class="flex items-center gap-2">
      <button type="button" class="btn-icon outline-none" onclick={onBack} aria-label={$_("common.back")}>
        <ArrowLeft size={16} />
      </button>
      <Database size={16} class="text-accent-secondary" />
      <h2 class="text-fg-default text-lg font-semibold">{$_("data.title")}</h2>
    </div>
    <button type="button" class="btn-icon outline-none" onclick={onClose} aria-label={$_("common.close")}>
      <X size={16} />
    </button>
  {/snippet}

  <div class="flex flex-col gap-2 p-4">
    {#each actions as action (action.label)}
      <div class="list-row flex items-center gap-3 rounded border">
        <button
          type="button"
          class="btn-base w-fit shrink-0"
          class:btn-base--danger={action.danger}
          onclick={action.handler}
          disabled={busy}
          use:tooltip={action.danger ? action.description : ""}
        >
          {action.label}
        </button>
        <p class="text-ui-sm text-fg-muted leading-relaxed">{action.description}</p>
      </div>
    {/each}
  </div>
</Modal>
