import type { FileEntry } from '$lib/types/api';
import { callBackend } from '$lib/utils/backend';

export async function listDirectory(path: string, showHidden: boolean): Promise<FileEntry[]> {
  return (
    (await callBackend('list_directory', { path, showHidden }, 'File:ListDirectory', undefined, {
      report: true,
      msg: 'Failed to load directory',
    })) ?? []
  );
}
