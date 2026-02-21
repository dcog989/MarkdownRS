import type { OperationId } from '$lib/config/textOperationsRegistry';
import type { Bookmark } from '$lib/stores/bookmarkStore.svelte';
import type { RenderResult } from './markdown';

export interface AppInfo {
    name: string;
    version: string;
    install_path: string;
    data_path: string;
    cache_path: string;
    logs_path: string;
    os_platform: string;
}

export interface FileMetadata {
    created?: string;
    modified?: string;
    size: number;
}

export interface FileContent {
    content: string;
    encoding: string;
}

export interface TabData {
    content: string | null;
    history_state: unknown;
}

// Format document is handled via format_markdown, not transform_text_content
export type TextTransformId = Exclude<OperationId, 'format-document'>;

// Maps Rust command names to their Argument and Return types
export interface BackendCommands {
    // Session
    save_session: {
        args: { activeTabs: unknown[]; closedTabs: unknown[] };
        return: void;
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
        return: void;
    };

    // File System
    read_text_file: {
        args: { path: string };
        return: FileContent;
    };
    write_text_file: {
        args: { path: string; content: string };
        return: void;
    };
    write_binary_file: {
        args: { path: string; content: number[] };
        return: void;
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
        return: void;
    };
    rename_file: {
        args: { oldPath: string; newPath: string };
        return: void;
    };
    add_to_recent_files: {
        args: { path: string; lastOpened: string };
        return: void;
    };
    get_recent_files: {
        args: Record<string, never>;
        return: string[];
    };
    remove_from_recent_files: {
        args: { path: string };
        return: void;
    };
    clear_recent_files: {
        args: Record<string, never>;
        return: void;
    };

    // App Info
    get_app_info: {
        args: Record<string, never>;
        return: AppInfo;
    };

    // Dictionary / Spellcheck
    add_to_dictionary: {
        args: { word: string };
        return: void;
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
        return: void;
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
    format_markdown: {
        args: {
            content: string;
            flavor?: string;
            listIndent?: number;
            bulletChar?: string;
            codeBlockFence?: string;
            emphasisChar?: string;
            tableAlignment?: boolean;
        };
        return: string;
    };
    get_markdown_flavors: {
        args: Record<string, never>;
        return: string[];
    };
    compute_text_metrics: {
        args: { content: string };
        return: [number, number, number, number];
    };

    // Bookmarks
    add_bookmark: {
        args: { bookmark: Bookmark };
        return: void;
    };
    get_all_bookmarks: {
        args: Record<string, never>;
        return: Bookmark[];
    };
    delete_bookmark: {
        args: { id: string };
        return: void;
    };
    update_bookmark_access_time: {
        args: { id: string; lastAccessed: string };
        return: void;
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
        return: void;
    };
    set_context_menu_item: {
        args: { enable: boolean };
        return: void;
    };
    check_context_menu_status: {
        args: Record<string, never>;
        return: boolean;
    };

    // Updater
    check_for_updates: {
        args: Record<string, never>;
        return: { available: boolean; version: string | null; release_notes: string | null };
    };
    download_and_install_update: {
        args: Record<string, never>;
        return: void;
    };

    // Export
    export_to_pdf: {
        args: { path: string; content: string; title: string; backgroundColor: string | null };
        return: void;
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
    export_recent_files: {
        args: Record<string, never>;
        return: string[];
    };
    import_recent_files: {
        args: { paths: string[] };
        return: number;
    };
    delete_orphan_files: {
        args: Record<string, never>;
        return: number;
    };

    // Window State (Plugin)
    'plugin:window-state|save_window_state': {
        args: Record<string, never>;
        return: void;
    };
}

export type CommandName = keyof BackendCommands;
