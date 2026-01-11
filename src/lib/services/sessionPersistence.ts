import { addTab, markTabPersisted } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte.ts";
import { callBackend } from "$lib/utils/backend";
import { CONFIG } from "$lib/utils/config";
import { formatTimestampForDisplay } from "$lib/utils/date";
import { AppError } from "$lib/utils/errorHandling";
import { debounce } from "$lib/utils/timing";
import {
    checkAndReloadIfChanged,
    checkFileExists,
    normalizeLineEndings,
    refreshMetadata,
    reloadFileContent,
} from "./fileMetadata";
import { fileWatcher } from "./fileWatcher";

// Only import types if needed
import type { EditorTab } from "$lib/stores/editorStore.svelte";

type RustTabState = {
    id: string;
    title: string;
    content: string | null;
    is_dirty: boolean;
    path: string | null;
    scroll_percentage: number;
    created: string | null;
    modified: string | null;
    is_pinned: boolean;
    custom_title: string | null;
    file_check_failed?: boolean;
    file_check_performed?: boolean;
    mru_position?: number | null;
    sort_index?: number;
    original_index?: number | null;
};

class SessionPersistenceManager {
    private isSaving = false;
    private pendingSaveRequested = false;

    async requestSave(): Promise<void> {
        if (!appContext.editor.sessionDirty) {
            return;
        }

        if (this.isSaving) {
            this.pendingSaveRequested = true;

            return;
        }

        this.isSaving = true;

        try {
            await this.executeSave();
            while (this.pendingSaveRequested) {
                this.pendingSaveRequested = false;
                if (appContext.editor.sessionDirty) {
                    await this.executeSave();
                }
            }
        } finally {
            this.isSaving = false;
        }
    }

    private async executeSave(): Promise<void> {
        try {
            const mruPositionMap = new Map<string, number>();
            appContext.editor.mruStack.forEach((tabId, index) => mruPositionMap.set(tabId, index));

            // 1. Map Active Tabs
            const activeTabs = appContext.editor.tabs;
            const activeRustTabs: RustTabState[] = activeTabs.map((t, index) => {
                // CRITICAL FIX: Always save content for unsaved tabs OR if content has changed
                // contentChanged flag tracks if content needs to be saved since last persist
                const needsContent = !t.path || t.contentChanged || !t.isPersisted;

                return {
                    id: t.id,
                    path: t.path,
                    title: t.title,
                    content: needsContent ? t.content : null,
                    is_dirty: t.isDirty,
                    scroll_percentage: t.scrollPercentage,
                    created: t.created || null,
                    modified: t.modified || null,
                    is_pinned: t.isPinned || false,
                    custom_title: t.customTitle || null,
                    file_check_failed: t.fileCheckFailed || false,
                    file_check_performed: t.fileCheckPerformed || false,
                    mru_position: mruPositionMap.get(t.id) ?? null,
                    sort_index: index,
                    original_index: null,
                };
            });

            // 2. Map Closed Tabs
            const closedTabs: RustTabState[] = appContext.editor.closedTabsHistory.map(
                (entry, index) => {
                    const needsContent =
                        !entry.tab.path || entry.tab.contentChanged || !entry.tab.isPersisted;

                    return {
                        id: entry.tab.id,
                        path: entry.tab.path,
                        title: entry.tab.title,
                        content: needsContent ? entry.tab.content : null,
                        is_dirty: entry.tab.isDirty,
                        scroll_percentage: entry.tab.scrollPercentage,
                        created: entry.tab.created || null,
                        modified: entry.tab.modified || null,
                        is_pinned: entry.tab.isPinned || false,
                        custom_title: entry.tab.customTitle || null,
                        file_check_failed: entry.tab.fileCheckFailed || false,
                        file_check_performed: entry.tab.fileCheckPerformed || false,
                        mru_position: null,
                        sort_index: index,
                        original_index: entry.index,
                    };
                }
            );

            await callBackend(
                "save_session",
                { activeTabs: activeRustTabs, closedTabs: closedTabs },
                "Session:Save"
            );

            // 3. Update persistence state on success
            const hasUnsavedTabsWithContent = activeTabs.some(
                (t) => !t.path && t.content.length > 0
            );
            appContext.editor.sessionDirty = hasUnsavedTabsWithContent;

            activeTabs.forEach((t) => {
                markTabPersisted(t.id);
            });

            appContext.editor.closedTabsHistory.forEach((entry) => {
                if (entry.tab.isPersisted) {
                    entry.tab.contentChanged = false;
                }
            });
        } catch (err) {
            appContext.editor.sessionDirty = true;
            AppError.handle("Session:Save", err, {
                showToast: false,
                severity: "warning",
            });
        }
    }
}

const persistenceManager = new SessionPersistenceManager();

export async function initializeTabFileState(tab: EditorTab): Promise<void> {
    if (!tab.path) {
        return;
    }

    if (!tab.isDirty) {
        const hasChanged = await checkAndReloadIfChanged(tab.id);
        if (hasChanged) {
            await reloadFileContent(tab.id);
        }
    }

    if (tab.isDirty) {
        try {
            const res = await callBackend("read_text_file", { path: tab.path }, "File:Read");

            if (!res) {
                throw new Error("Failed to read file: null result");
            }

            const storeTab = appContext.editor.tabs.find((x) => x.id === tab.id);
            if (storeTab) {
                storeTab.lastSavedContent = normalizeLineEndings(res.content);
                storeTab.isDirty = storeTab.content !== storeTab.lastSavedContent;
            }
        } catch (err) {
            AppError.handle("File:Read", err, {
                showToast: false,
                severity: "warning",
                additionalInfo: { path: tab.path },
            });
        }
    }

    await refreshMetadata(tab.id, tab.path);
    await checkFileExists(tab.id);

    try {
        await fileWatcher.watch(tab.path);
    } catch (err) {
        AppError.handle("FileWatcher:Watch", err, {
            showToast: false,
            severity: "warning",
            additionalInfo: { path: tab.path },
        });
    }
}

export async function persistSession(): Promise<void> {
    await persistenceManager.requestSave();
}

/**
 * Lazy load content for a tab from the database
 */
export async function loadTabContentLazy(tabId: string): Promise<void> {
    const index = appContext.editor.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) {
        return;
    }

    const tab = appContext.editor.tabs[index];
    if (tab.contentLoaded) {
        return;
    }

    try {
        // Now returns { content }
        const data = await callBackend("load_tab_content", { tabId }, "Session:Load");

        if (data && data.content !== null && data.content !== undefined) {
            const normalizedContent = normalizeLineEndings(data.content);

            // Determine the correct lastSavedContent
            // For unsaved tabs (no path): lastSavedContent should be empty since there's no file
            // For saved tabs with isDirty: load from disk to get the actual last saved content
            // For clean saved tabs: content === lastSavedContent
            let lastSavedContent = "";

            if (!tab.path) {
                // Unsaved tab - no file on disk, so lastSavedContent is empty
                lastSavedContent = "";
            } else if (tab.isDirty) {
                // Dirty tab with a file - read from disk to get the actual last saved content
                try {
                    const fileData = await callBackend(
                        "read_text_file",
                        { path: tab.path },
                        "File:Read"
                    );
                    if (fileData && fileData.content) {
                        lastSavedContent = normalizeLineEndings(fileData.content);
                    }
                } catch (err) {
                    // If we can't read the file, treat normalized content as last saved
                    // This handles cases where the file was deleted or is inaccessible
                    lastSavedContent = normalizedContent;
                }
            } else {
                // Clean tab - content matches what's on disk
                lastSavedContent = normalizedContent;
            }

            // Use reassignment to ensure Svelte 5 triggers reactivity for nested properties
            appContext.editor.tabs[index] = {
                ...tab,
                content: normalizedContent,
                lastSavedContent,
                sizeBytes: new TextEncoder().encode(normalizedContent).length,
                lineEnding: normalizedContent.indexOf("\r\n") !== -1 ? "CRLF" : "LF",
                contentLoaded: true,
            };
        } else {
            tab.contentLoaded = true;
        }
    } catch (err) {
        AppError.handle("Session:Load", err, {
            showToast: false,
            severity: "warning",
            additionalInfo: { tabId },
        });
        tab.contentLoaded = true;
    }
}

function convertRustTabToEditorTab(t: RustTabState, contentLoaded: boolean = true): EditorTab {
    const rawContent = t.content || "";
    const content = normalizeLineEndings(rawContent);
    const timestamp = t.modified || t.created || "";

    // For unsaved tabs (no path), lastSavedContent should be empty
    // For saved tabs, if content is loaded, it equals content (will be corrected later for dirty tabs)
    const lastSavedContent = !t.path ? "" : content;

    return {
        id: t.id,
        title: t.title,
        originalTitle: t.title,
        content,
        lastSavedContent,
        isDirty: t.is_dirty,
        path: t.path,
        scrollPercentage: t.scroll_percentage,
        sizeBytes: new TextEncoder().encode(content).length,
        cursor: { anchor: 0, head: 0 },
        created: t.created || undefined,
        modified: t.modified || undefined,
        formattedTimestamp: formatTimestampForDisplay(timestamp),
        isPinned: t.is_pinned,
        customTitle: t.custom_title || undefined,
        lineEnding: t.content && t.content.indexOf("\r\n") !== -1 ? "CRLF" : "LF",
        encoding: "UTF-8",
        fileCheckFailed: t.file_check_failed || false,
        fileCheckPerformed: t.file_check_performed || false,
        // CRITICAL: Mark content as changed if it's an unsaved tab with content
        // This ensures it will be saved on the next session save
        contentChanged: !t.path && content.length > 0,
        isPersisted: true,
        contentLoaded,
    };
}

export async function loadSession(): Promise<void> {
    try {
        const sessionData = await callBackend("restore_session", {}, "Session:Load");

        let activeRustTabs: RustTabState[] = [];
        let closedRustTabs: RustTabState[] = [];

        if (Array.isArray(sessionData)) {
            activeRustTabs = sessionData;
        } else if (sessionData && typeof sessionData === "object") {
            activeRustTabs = sessionData.active_tabs || [];
            closedRustTabs = sessionData.closed_tabs || [];
        }

        if (activeRustTabs.length > 0) {
            activeRustTabs.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));

            // Convert tabs - all content is now loaded immediately
            const convertedTabs: EditorTab[] = activeRustTabs.map((t) => {
                const tab = convertRustTabToEditorTab(t, true);
                return tab;
            });

            appContext.editor.tabs = convertedTabs;

            const sortedMru = activeRustTabs
                .filter((t) => t.mru_position !== null && t.mru_position !== undefined)
                .sort((a, b) => (a.mru_position || 0) - (b.mru_position || 0))
                .map((t) => t.id);

            appContext.editor.mruStack =
                sortedMru.length > 0 ? sortedMru : convertedTabs.map((t) => t.id);

            // Initialize Active Tab Logic

            switch (appContext.app.startupBehavior) {
                case "first":
                    appContext.app.activeTabId = convertedTabs[0].id;

                    break;
                case "last-focused":
                    appContext.app.activeTabId =
                        appContext.editor.mruStack[0] || convertedTabs[0].id;

                    break;
                case "new":
                    break;
                default:
                    appContext.app.activeTabId = convertedTabs[0].id;
            }

            const activeTab = appContext.editor.tabs.find(
                (t) => t.id === appContext.app.activeTabId
            );
            if (activeTab) {
                await initializeTabFileState(activeTab);
            }
        }

        // Ensure there's always one tab if empty or requested "new"
        if (appContext.editor.tabs.length === 0 || appContext.app.startupBehavior === "new") {
            if (appContext.app.startupBehavior === "new" && activeRustTabs.length > 0) {
                appContext.app.activeTabId = addTab();
            } else if (appContext.editor.tabs.length === 0) {
                appContext.app.activeTabId = addTab();
            }
        }

        if (closedRustTabs.length > 0) {
            closedRustTabs.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));

            appContext.editor.closedTabsHistory = closedRustTabs.map((t) => {
                const tab = convertRustTabToEditorTab(t, true);

                return {
                    tab,
                    index: t.original_index ?? 0,
                };
            });
        }

        // Set sessionDirty if there are unsaved tabs with content
        const hasUnsavedTabsWithContent = appContext.editor.tabs.some(
            (t) => !t.path && t.content.length > 0
        );
        appContext.editor.sessionDirty = hasUnsavedTabsWithContent;
    } catch (err) {
        AppError.handle("Session:Load", err, {
            showToast: false,
            severity: "warning",
        });

        appContext.app.activeTabId = addTab();
    }
}

export const persistSessionDebounced = debounce(persistSession, CONFIG.SESSION.SAVE_DEBOUNCE_MS);
