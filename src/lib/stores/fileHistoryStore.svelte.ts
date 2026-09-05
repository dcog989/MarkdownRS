import { appContext } from "$lib/stores/state.svelte";
import { callBackend } from "$lib/utils/backend";
import { getCurrentTimestamp } from "$lib/utils/date";

export const fileHistoryStore = $state({
  files: [] as string[],
  isLoaded: false,
});

export async function loadFileHistory() {
  if (fileHistoryStore.isLoaded) return;

  const files = await callBackend("get_file_history", {}, "Database:Init", undefined, {
    ignore: true,
  });

  if (files) {
    fileHistoryStore.files = files;
  }
  fileHistoryStore.isLoaded = true;
}

export async function addToFileHistory(path: string) {
  const timestamp = getCurrentTimestamp();

  // Optimistic UI update
  fileHistoryStore.files = [path, ...fileHistoryStore.files.filter((f) => f !== path)].slice(
    0,
    appContext.settings.fileHistoryLimit,
  );

  await callBackend("add_to_file_history", { path, lastOpened: timestamp }, "Database:Init", undefined, {
    ignore: true,
  });
}

export async function removeFromFileHistory(path: string) {
  // Optimistic UI update
  fileHistoryStore.files = fileHistoryStore.files.filter((f) => f !== path);

  await callBackend("remove_from_file_history", { path }, "Database:Init", undefined, {
    ignore: true,
  });
}

export async function clearFileHistory() {
  fileHistoryStore.files = [];
  await callBackend("clear_file_history", {}, "Database:Init", undefined, {
    ignore: true,
  });
}
