import { callBackend } from './backend';

export async function readTextFile(path: string): Promise<{ content: string; encoding: string } | null> {
  return callBackend('read_text_file', { path }, 'File:Read');
}

export async function getFileMetadata(path: string): Promise<{ size: number } | null> {
  return callBackend('get_file_metadata', { path }, 'File:Metadata');
}

export async function resolveRelativePath(basePath: string | null, clickPath: string): Promise<string | null> {
  return callBackend('resolve_path_relative', { basePath, clickPath }, 'File:Read');
}

export async function renameFileOnDisk(oldPath: string, newPath: string): Promise<void> {
  await callBackend('rename_file', { oldPath, newPath }, 'File:Write', undefined, {
    report: true,
    msg: 'Failed to rename file',
  });
}

export async function writeTextFile(path: string, content: string): Promise<boolean> {
  const result = await callBackend('write_text_file', { path, content }, 'File:Write');
  return !!result;
}
