import type { OperationId } from "$lib/config/textOperationsRegistry";
import type { Bookmark } from "$lib/stores/bookmarkStore.svelte";
import type { HeadingEntry, RenderResult } from "./markdown";

export interface AppInfo {
  name: string;
  version: string;
  install_path: string;
  data_path: string;
  cache_path: string;
  logs_path: string;
  log_file_path: string;
  os_platform: string;
}

export interface FileMetadata {
  created?: string;
  modified?: string;
  size: number;
}

/** Value of `LintDiagnostic.source` for grammar (Harper) diagnostics. */
export const LINT_SOURCE_HARPER = "harper";
/** Value of `LintDiagnostic.source` for style (rumdl) diagnostics. */
export const LINT_SOURCE_RUMDL = "rumdl";

export interface LintDiagnostic {
  message: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  severity: "error" | "warning" | "info";
  fixable: boolean;
  rule_name: string | null;
  source: string;
}

export interface FileContent {
  content: string;
  encoding: string;
  has_bom: boolean;
}

export interface WriteFileResult {
  bytes_written: number;
  encoding: string;
  has_bom: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  modified: string | null;
}

export interface TabData {
  content: string | null;
  history_state: unknown;
}

// Server-side operations are handled via dedicated backend commands, not client-side transform
export type TextTransformId = Exclude<OperationId, "format-document" | "generate-toc">;

// Maps Rust command names to their Argument and Return types
export interface BackendCommands {
  // Session
  save_session: {
    args: { activeTabs: unknown[]; closedTabs: unknown[] };
    return: undefined;
  };
  restore_session: {
    args: Record<string, never>;
    return: { active_tabs: unknown[]; closed_tabs: unknown[] } | unknown[];
  };
  load_tab_content: {
    args: { tabId: string };
    return: TabData;
  };
  vacuum_database: {
    args: Record<string, never>;
    return: undefined;
  };

  // File System
  read_text_file: {
    args: { path: string };
    return: FileContent;
  };
  write_text_file: {
    args: { path: string; content: string; encoding?: string; hasBom?: boolean };
    return: WriteFileResult;
  };
  write_binary_file: {
    args: { path: string; content: Uint8Array };
    return: undefined;
  };
  copy_file: {
    args: { fromPath: string; toPath: string };
    return: undefined;
  };
  get_file_metadata: {
    args: { path: string };
    return: FileMetadata;
  };
  resolve_path_relative: {
    args: { basePath: string | null; clickPath: string };
    return: string;
  };
  send_to_recycle_bin: {
    args: { path: string };
    return: undefined;
  };
  rename_file: {
    args: { oldPath: string; newPath: string };
    return: undefined;
  };
  create_file: {
    args: { path: string };
    return: undefined;
  };
  create_dir: {
    args: { path: string };
    return: undefined;
  };
  ensure_dir: {
    args: { path: string };
    return: undefined;
  };
  path_exists: {
    args: { path: string };
    return: boolean;
  };
  add_to_file_history: {
    args: { path: string; lastOpened: string };
    return: undefined;
  };
  get_file_history: {
    args: Record<string, never>;
    return: string[];
  };
  remove_from_file_history: {
    args: { path: string };
    return: undefined;
  };
  clear_file_history: {
    args: Record<string, never>;
    return: undefined;
  };

  // File Tree
  list_directory: {
    args: { path: string; showHidden: boolean };
    return: FileEntry[];
  };
  get_directory_mtime: {
    args: { path: string };
    return: number | null;
  };

  // App Info
  get_app_info: {
    args: Record<string, never>;
    return: AppInfo;
  };

  // Dictionary / Spellcheck
  add_to_dictionary: {
    args: { word: string };
    return: undefined;
  };
  add_words_to_dictionary: {
    args: { words: string[] };
    return: undefined;
  };
  load_user_dictionary: {
    args: Record<string, never>;
    return: string[];
  };
  init_spellchecker: {
    args: {
      dictionaries?: string[];
      technicalDictionaries?: boolean;
      scienceDictionaries?: boolean;
    };
    return: undefined;
  };
  check_words: {
    args: { words: string[] };
    return: string[];
  };
  get_spelling_suggestions: {
    args: { word: string };
    return: string[];
  };
  get_spellcheck_status: {
    args: Record<string, never>;
    return: string;
  };
  cancel_spellcheck_init: {
    args: Record<string, never>;
    return: undefined;
  };

  // Markdown / Text
  render_markdown: {
    args: { content: string; flavor?: string };
    return: RenderResult;
  };
  generate_document_toc: {
    args: { content: string; headings?: HeadingEntry[] };
    return: string;
  };
  format_markdown: {
    args: {
      content: string;
      filePath?: string;
    };
    return: string;
  };
  lint_markdown: {
    args: {
      content: string;
      filePath?: string;
      harperEnabled?: boolean;
      harperLinters?: Record<string, boolean>;
    };
    return: LintDiagnostic[];
  };
  get_rumdl_config_path: {
    args: {
      filePath?: string;
    };
    return: string | null;
  };
  read_rumdl_config: {
    args: {
      filePath?: string;
      target?: "project" | "user";
    };
    return: {
      target_path: string;
      exists: boolean;
      content: string;
      loaded_path: string | null;
    };
  };
  write_rumdl_config: {
    args: {
      filePath?: string;
      target?: "project" | "user";
      content: string;
    };
    return: string;
  };
  get_markdown_flavors: {
    args: Record<string, never>;
    return: string[];
  };
  // Bookmarks
  add_bookmark: {
    args: { bookmark: Bookmark };
    return: undefined;
  };
  get_all_bookmarks: {
    args: Record<string, never>;
    return: Bookmark[];
  };
  delete_bookmark: {
    args: { id: string };
    return: undefined;
  };
  update_bookmark_access_time: {
    args: { id: string; lastAccessed: string };
    return: undefined;
  };

  // Settings / Themes
  get_available_themes: {
    args: Record<string, never>;
    return: string[];
  };
  get_theme_css: {
    args: { themeName: string };
    return: string;
  };
  load_settings: {
    args: Record<string, never>;
    return: Record<string, unknown>;
  };
  save_settings: {
    args: { settings: unknown };
    return: undefined;
  };
  set_log_level: {
    args: { level: string };
    return: undefined;
  };
  set_context_menu_item: {
    args: { enable: boolean };
    return: undefined;
  };
  check_context_menu_status: {
    args: Record<string, never>;
    return: boolean;
  };

  // Export
  export_to_pdf: {
    args: { path: string; content: string; backgroundColor: string | null };
    return: undefined;
  };
  // Data Management
  export_bookmarks: {
    args: Record<string, never>;
    return: Bookmark[];
  };
  import_bookmarks: {
    args: { bookmarks: Bookmark[] };
    return: number;
  };
  export_file_history: {
    args: Record<string, never>;
    return: string[];
  };
  import_file_history: {
    args: { paths: string[] };
    return: number;
  };
  delete_orphan_files: {
    args: Record<string, never>;
    return: number;
  };

  // Window
  set_window_title: {
    args: { title: string };
    return: undefined;
  };

  // Window State (Plugin)
  "plugin:window-state|save_window_state": {
    args: Record<string, never>;
    return: undefined;
  };
}

export type CommandName = keyof BackendCommands;
