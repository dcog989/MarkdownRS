import { translate } from "$lib/i18n";
import type { FileEntry } from "$lib/types/api";
import { callBackend } from "$lib/utils/backend";

export async function listDirectory(path: string, showHidden: boolean): Promise<FileEntry[]> {
  return (
    (await callBackend("list_directory", { path, showHidden }, "File:ListDirectory", undefined, {
      report: true,
      msg: translate("fileOps.failedLoadDirectory"),
    })) ?? []
  );
}

export async function getDirectoryMtime(path: string): Promise<number | null> {
  return (
    (await callBackend("get_directory_mtime", { path }, "File:StatDirectory", undefined, {
      ignore: true,
    })) ?? null
  );
}
