import type { Bookmark } from "$lib/stores/bookmarkStore.svelte";
import type { HeadingEntry, RenderResult } from "./markdown";

export interface AppInfo {
  name: string;
  version: string;
  install_path: string;
  data_path: string;
  config_path: string;
  cache_path: string;
  logs_path: string;
  log_file_path: string;
  os_platform: string;
  can_self_update: boolean;
}

export interface FileMetadata {
  created?: string;
  modified?: string;
  size: number;
}

/** Value of `LintDiagnostic.source` for grammar (Harper) diagnostics. */
export const LINT_SOURCE_HARPER = "harper";

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
  size: number;
  modified: string | null;
}

export interface TabData {
  content: string | null;
}

/** One tab as stored in the session database and sent over IPC. */
export interface RustTabState {
  id: string;
  title: string;
  content: string | null;
  is_dirty: boolean;
  path: string | null;
  scroll_percentage: number;
  scroll_top: number;
  top_line: number;
  created: string | null;
  modified: string | null;
  is_pinned: boolean;
  custom_title: string | null;
  file_check_failed?: boolean;
  file_check_performed?: boolean;
  mru_position?: number | null;
  sort_index?: number;
  original_index?: number | null;
  line_ending?: string | null;
  encoding?: string | null;
  has_bom?: boolean;
  preferred_extension?: string | null;
}

// Maps Rust command names to their Argument and Return types
export interface BackendCommands {
  // Session
  save_session: {
    args: { activeTabs: RustTabState[]; closedTabs: RustTabState[] };
    return: undefined;
  };
  restore_session: {
    args: Record<string, never>;
    return: { active_tabs: RustTabState[]; closed_tabs: RustTabState[] } | RustTabState[];
  };
  load_tab_content: {
    args: { tabId: string };
    return: TabData;
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
  add_words_to_dictionary: {
    args: { words: string[] };
    return: boolean;
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
  get_theme_variants: {
    args: Record<string, never>;
    return: Record<string, boolean>;
  };
  get_theme_css: {
    args: { themeName: string };
    return: string;
  };
  get_system_accent_color: {
    args: Record<string, never>;
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
  log_frontend: {
    args: { level: string; message: string };
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
    args: { path: string; content: string };
    return: undefined;
  };
  export_to_docx: {
    args: { path: string; content: string };
    return: undefined;
  };
  export_to_epub: {
    args: { path: string; content: string; title: string; flavor: string | null };
    return: undefined;
  };
  export_to_latex: {
    args: { path: string; content: string; flavor: string | null };
    return: undefined;
  };
  // Data Management
  import_bookmarks: {
    args: { bookmarks: Bookmark[] };
    return: number;
  };
  import_file_history: {
    args: { paths: string[] };
    return: number;
  };
  delete_orphan_files: {
    args: { dryRun: boolean; paths?: string[] };
    return: string[];
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
