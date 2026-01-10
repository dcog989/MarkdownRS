import type { OperationId } from "$lib/config/textOperationsRegistry";
import type { Bookmark } from "$lib/stores/bookmarkStore.svelte";
import type { RenderResult } from "./markdown";

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
}

export interface FileContent {
    content: string;
    encoding: string;
}

// Format document is handled via format_markdown, not transform_text_content
export type TextTransformId = Exclude<OperationId, "format-document">;

// Maps Rust command names to their Argument and Return types
export interface BackendCommands {
    // Session
    save_session: {
        args: { activeTabs: any[]; closedTabs: any[] };
        return: void;
    };
    restore_session: {
        args: Record<string, never>;
        return: { active_tabs: any[]; closed_tabs: any[] } | any[];
    };
    load_tab_content: {
        args: { tabId: string };
        return: string | null;
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
    get_custom_dictionary: {
        args: Record<string, never>;
        return: string[];
    };
    init_spellchecker: {
        args: { dictionaries?: string[]; specialistDictionaries?: string[] };
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

    // Markdown / Text
    render_markdown: {
        args: { content: string; flavor?: string };
        return: RenderResult;
    };
    format_markdown: {
        args: {
            content: string;
            flavor?: string;
            list_indent?: number;
            bullet_char?: string;
            code_block_fence?: string;
            table_alignment?: boolean;
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
        return: Record<string, any>;
    };
    save_settings: {
        args: { settings: any };
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

    // Window State (Plugin)
    "plugin:window-state|save_window_state": {
        args: Record<string, never>;
        return: void;
    };
}

export type CommandName = keyof BackendCommands;
