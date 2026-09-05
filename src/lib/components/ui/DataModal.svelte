<script lang="ts">
import { open, save } from "@tauri-apps/plugin-dialog";
import { Database, X } from "lucide-svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import Modal from "$lib/components/ui/Modal.svelte";
import { translate } from "$lib/i18n";
import { showToast } from "$lib/stores/toastStore.svelte";
import { callBackend } from "$lib/utils/backend";
import { AppError } from "$lib/utils/errorHandling";

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
    const bookmarks = await callBackend("export_bookmarks", {}, "Data:ExportBookmarks");
    if (!bookmarks) return;
    const path = await save({
      defaultPath: "markdownrs-bookmarks.json",
      filters: [{ name: translate("data.jsonFilter"), extensions: ["json"] }],
    });
    if (!path) return;
    await callBackend("write_text_file", { path, content: JSON.stringify(bookmarks, null, 2) }, "File:Write");
    showToast("success", translate("data.exportedBookmarks", { values: { count: bookmarks.length } }));
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
      filters: [{ name: translate("data.jsonFilter"), extensions: ["json"] }],
    });
    if (!selected) return;
    const result = await callBackend("read_text_file", { path: selected as string }, "File:Read");
    if (!result) throw new Error(translate("data.failedToRead"));
    const bookmarks = JSON.parse(result.content);
    if (!Array.isArray(bookmarks)) throw new Error(translate("data.invalidFormatArray"));
    const count = await callBackend("import_bookmarks", { bookmarks }, "Data:ImportBookmarks");
    showToast("success", translate("data.importedBookmarks", { values: { count } }));
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
    const paths = await callBackend("export_file_history", {}, "Data:ExportFileHistory");
    if (!paths) return;
    const dest = await save({
      defaultPath: "markdownrs-file-history.json",
      filters: [{ name: translate("data.jsonFilter"), extensions: ["json"] }],
    });
    if (!dest) return;
    await callBackend("write_text_file", { path: dest, content: JSON.stringify(paths, null, 2) }, "File:Write");
    showToast("success", translate("data.exportedFiles", { values: { count: paths.length } }));
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
      filters: [{ name: translate("data.jsonFilter"), extensions: ["json"] }],
    });
    if (!selected) return;
    const result = await callBackend("read_text_file", { path: selected as string }, "File:Read");
    if (!result) throw new Error(translate("data.failedToRead"));
    const paths = JSON.parse(result.content);
    if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) {
      throw new Error(translate("data.invalidFormatStrings"));
    }
    const count = await callBackend("import_file_history", { paths }, "Data:ImportFileHistory");
    showToast("success", translate("data.importedFiles", { values: { count } }));
  } catch (err) {
    AppError.handle("Data:ImportFileHistory", err, { showToast: true });
  } finally {
    busy = false;
  }
}

async function deleteOrphans() {
  if (busy) return;
  busy = true;
  try {
    const count = await callBackend("delete_orphan_files", {}, "Data:DeleteOrphans");
    showToast("success", translate("data.removedOrphans", { values: { count } }));
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
    label: translate("data.exportBookmarks"),
    description: translate("data.exportBookmarksDesc"),
    handler: exportBookmarks,
  },
  {
    label: translate("data.importBookmarks"),
    description: translate("data.importBookmarksDesc"),
    handler: importBookmarks,
  },
  {
    label: translate("data.exportFileHistory"),
    description: translate("data.exportFileHistoryDesc"),
    handler: exportFileHistory,
  },
  {
    label: translate("data.importFileHistory"),
    description: translate("data.importFileHistoryDesc"),
    handler: importFileHistory,
  },
  {
    label: translate("data.deleteOrphans"),
    description: translate("data.deleteOrphansDesc"),
    handler: deleteOrphans,
    danger: true,
  },
]);
</script>

<Modal bind:isOpen {onClose}>
  {#snippet header()}
    <div class="flex items-center gap-2">
      <Database size={16} class="text-accent-secondary" />
      <h2 class="text-fg-default text-sm font-semibold">{$_('data.title')}</h2>
    </div>
    <button
      type="button"
      class="text-fg-muted hover-surface hover:text-danger rounded p-1 transition-colors outline-none"
      onclick={onClose}
      aria-label={$_('common.close')}
    >
      <X size={16} />
    </button>
  {/snippet}

  <div class="flex flex-col gap-6 p-6">
    {#each actions as action (action.label)}
      <div class="flex flex-col gap-2 items-start">
        <button
          type="button"
          class="text-ui bg-bg-input text-fg-default border border-border-main rounded py-1.5 px-3 text-left outline-none transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-40 w-fit"
          class:text-danger-text={action.danger}
          onclick={action.handler}
          disabled={busy}
          use:tooltip={action.danger
                        ? translate('data.deleteOrphansDesc')
                        : ''}
        >
          {action.label}
        </button>
        <p class="text-ui-sm text-fg-muted px-1 leading-relaxed">{action.description}</p>
      </div>
    {/each}
  </div>
</Modal>
