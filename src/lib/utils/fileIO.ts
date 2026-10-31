import { translate } from "$lib/i18n";
import type { FileMetadata, WriteFileResult } from "$lib/types/api";
import { callBackend } from "./backend";
import { AppError } from "./errorHandling";
import { getFilename } from "./fileValidation";

export async function readTextFile(
  path: string,
): Promise<{ content: string; encoding: string; has_bom: boolean } | null> {
  return callBackend("read_text_file", { path }, "File:Read");
}

export async function getFileMetadata(path: string): Promise<FileMetadata | null> {
  return callBackend("get_file_metadata", { path }, "File:Metadata");
}

export async function resolveRelativePath(basePath: string | null, clickPath: string): Promise<string | null> {
  return callBackend("resolve_path_relative", { basePath, clickPath }, "File:Read");
}

export async function renameFileOnDisk(oldPath: string, newPath: string): Promise<boolean> {
  try {
    await callBackend("rename_file", { oldPath, newPath }, "File:Write");
    return true;
  } catch (err) {
    const targetExists = err instanceof Error && err.message.includes("already exists");
    AppError.handle("File:Write", err, {
      showToast: true,
      userMessage: targetExists
        ? translate("fileOps.renameTargetExists", { values: { name: getFilename(newPath) } })
        : translate("fileOps.failedRename"),
    });
    return false;
  }
}

export async function trashFileOnDisk(path: string): Promise<boolean> {
  try {
    await callBackend("send_to_recycle_bin", { path }, "File:Write");
    return true;
  } catch (err) {
    AppError.handle("File:Write", err, {
      showToast: true,
      userMessage: translate("fileOps.failedDelete"),
    });
    return false;
  }
}

export async function createFileOnDisk(path: string): Promise<boolean> {
  try {
    await callBackend("create_file", { path }, "File:Write");
    return true;
  } catch (err) {
    AppError.handle("File:Write", err, {
      showToast: true,
      userMessage: translate("fileTree.failedCreateFile"),
    });
    return false;
  }
}

export async function createDirOnDisk(path: string): Promise<boolean> {
  try {
    await callBackend("create_dir", { path }, "File:Write");
    return true;
  } catch (err) {
    AppError.handle("File:Write", err, {
      showToast: true,
      userMessage: translate("fileTree.failedCreateDir"),
    });
    return false;
  }
}

export async function writeTextFile(
  path: string,
  content: string,
  options?: { encoding?: string; hasBom?: boolean },
): Promise<WriteFileResult> {
  const result = await callBackend("write_text_file", { path, content, ...options }, "File:Write");
  return result;
}
