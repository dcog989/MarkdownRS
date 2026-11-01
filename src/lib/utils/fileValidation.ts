import type { EditorTab } from "$lib/stores/editorTypes";
import { basename as getFilename } from "./path";

export { getFilename };

export const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdown", "mkdn", "mkd", "mdwn", "mdtxt", "mdtext"];

export const MARKDOWN_EXTENSION_SET = new Set(MARKDOWN_EXTENSIONS.map((ext) => ext.toLowerCase()));

export const SUPPORTED_TEXT_EXTENSIONS = [
  // Markdown & Text
  ...MARKDOWN_EXTENSIONS,
  "txt",
  "log",
  "asc",
  "adoc",
  // Web
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "svelte",
  "vue",
  "json",
  // Config
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "properties",
  "env",
  "gitignore",
  // Code
  "rs",
  "py",
  "rb",
  "php",
  "pl",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "swift",
  "kt",
  "kts",
  "sh",
  "bash",
  "zsh",
  "bat",
  "cmd",
  "ps1",
  "lua",
  "sql",
  // Data/Misc
  "xml",
  "svg",
  "diff",
  "patch",
  "csv",
  "tsv",
];

/** Extensions shown as an image: image pasting and the file tree icon share one list. */
export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico"]);

/**
 * Format file size for display with smart rounding:
 * - Below 1 KB: round up to nearest tenth (e.g., 0.1 KB, 0.5 KB)
 * - From 1 KB to < 1 MB: round up to whole KB (e.g., 15 KB, 500 KB)
 * - MB and above: round up to nearest tenth (e.g., 1.5 MB, 2.3 GB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 KB";

  const kb = bytes / 1024;

  // MB range and above
  if (kb >= 1024) {
    const mb = kb / 1024;
    if (mb >= 1024) {
      // GB range - round up to nearest tenth
      return `${Math.ceil(mb / 102.4) / 10} GB`;
    }
    // MB range - round up to nearest tenth
    return `${Math.ceil(mb * 10) / 10} MB`;
  }

  // Below 1 KB - round up to nearest tenth
  if (kb < 1) {
    const rounded = Math.ceil(kb * 10) / 10;
    return `${rounded} KB`;
  }

  // From 1 KB to < 1 MB - round up to whole KB
  return `${Math.ceil(kb)} KB`;
}

/**
 * Check if path is a markdown file
 */
export function isMarkdownFile(path: string): boolean {
  const filename = getFilename(path);
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension ? MARKDOWN_EXTENSIONS.includes(extension) : false;
}

/**
 * A name that stays inside the folder it is typed in. Without this a "rename"
 * to `../notes` or `sub/notes` silently moves the file out of its folder.
 */
export function isValidFileName(name: string): boolean {
  return name !== "." && name !== ".." && !/[/\\]/.test(name);
}

/**
 * Keep the old extension when the new name has none, so renaming `notes.md`
 * to `notes` does not silently turn it into a plain file. Used by every rename
 * path so an open tab and an unopened file get the same name.
 */
export function resolveRenamedName(oldName: string, newName: string): string {
  const oldExt = oldName.includes(".") ? oldName.split(".").pop() : "";
  const newExt = newName.includes(".") ? newName.split(".").pop() : "";
  return oldExt && !newExt ? `${newName}.${oldExt}` : newName;
}

/**
 * The single answer to "is this tab Markdown?": an explicit type choice wins,
 * then the path, and an untitled tab is Markdown.
 */
export function isMarkdownTab(tab: Pick<EditorTab, "path" | "preferredExtension"> | undefined): boolean {
  if (!tab) return true;
  if (tab.preferredExtension) return tab.preferredExtension === "md";
  return tab.path ? isMarkdownFile(tab.path) : true;
}
