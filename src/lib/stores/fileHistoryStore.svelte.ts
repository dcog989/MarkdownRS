import { callBackend } from "$lib/utils/backend";
import { getCurrentTimestamp } from "$lib/utils/date";
import { settingsState } from "./settingsState.svelte";

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
    fileHistoryStore.files = files.slice(0, settingsState.fileHistoryLimit);
  }
  fileHistoryStore.isLoaded = true;
}

export async function addToFileHistory(path: string) {
  const timestamp = getCurrentTimestamp();

  // Optimistic UI update
  fileHistoryStore.files = [path, ...fileHistoryStore.files.filter((f) => f !== path)].slice(
    0,
    settingsState.fileHistoryLimit,
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

export function pruneFileHistory(paths: string[]) {
  const removed = new Set(paths);
  fileHistoryStore.files = fileHistoryStore.files.filter((f) => !removed.has(f));
}
