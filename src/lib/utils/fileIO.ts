import { translate } from "$lib/i18n";
import type { WriteFileResult } from "$lib/types/api";
import { callBackend } from "./backend";
import { AppError } from "./errorHandling";
import { getFilename } from "./fileValidation";

export async function readTextFile(
  path: string,
): Promise<{ content: string; encoding: string; has_bom: boolean } | null> {
  return callBackend("read_text_file", { path }, "File:Read");
}

export async function getFileMetadata(path: string): Promise<{ size: number } | null> {
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

export async function createFileOnDisk(path: string): Promise<boolean> {
  const result = await callBackend("create_file", { path }, "File:Write", undefined, {
    report: true,
    msg: translate("fileTree.failedCreateFile"),
  });
  return result !== null;
}

export async function createDirOnDisk(path: string): Promise<boolean> {
  const result = await callBackend("create_dir", { path }, "File:Write", undefined, {
    report: true,
    msg: translate("fileTree.failedCreateDir"),
  });
  return result !== null;
}

export async function writeTextFile(
  path: string,
  content: string,
  options?: { encoding?: string; hasBom?: boolean },
): Promise<WriteFileResult | null> {
  const result = await callBackend("write_text_file", { path, content, ...options }, "File:Write");
  return result;
}
