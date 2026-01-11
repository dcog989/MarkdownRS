import { addToDictionary } from "$lib/services/dictionaryService";
import {
    checkAndReloadIfChanged,
    checkFileExists,
    invalidateMetadataCache,
    refreshMetadata,
    reloadFileContent,
    sanitizePath,
} from "$lib/services/fileMetadata";
import { fileWatcher } from "$lib/services/fileWatcher";
import {
    loadSession,
    persistSession,
    persistSessionDebounced,
} from "$lib/services/sessionPersistence";
import { getBookmarkByPath, updateBookmark } from "$lib/stores/bookmarkStore.svelte";
import { confirmDialog } from "$lib/stores/dialogStore.svelte";
import {
    addTab,
    closeTab,
    markAsSaved,
    pushToMru,
    reopenClosedTab,
    saveTabComplete,
    updateContentOnly,
    updateTabMetadataAndPath,
    updateTabTitle,
} from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte.ts";
import { showToast } from "$lib/stores/toastStore.svelte";
import { AppError } from "$lib/utils/errorHandling";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { callBackend } from "./backend";
import { CONFIG } from "./config";
import { isMarkdownFile, SUPPORTED_TEXT_EXTENSIONS } from "./fileValidation";
import { formatMarkdown } from "./formatterRust";
import { countWords } from "./textMetrics";

export {
    addToDictionary,
    checkAndReloadIfChanged,
    checkFileExists,
    loadSession,
    persistSession,
    persistSessionDebounced,
    reloadFileContent,
};

export async function openFile(path?: string): Promise<void> {
    try {
        let targetPath = path;

        if (!targetPath) {
            const selected = await open({
                multiple: false,
                filters: [
                    { name: "Text Files", extensions: SUPPORTED_TEXT_EXTENSIONS },
                    { name: "All Files", extensions: ["*"] },
                ],
            });
            if (!selected || typeof selected !== "string") return;
            targetPath = selected;
        }

        const sanitizedPath = sanitizePath(targetPath);
        const existingTab = appContext.editor.tabs.find((t) => t.path === sanitizedPath);

        if (existingTab) {
            appContext.app.activeTabId = existingTab.id;
            pushToMru(existingTab.id);
            return;
        }

        const result = await callBackend("read_text_file", { path: sanitizedPath }, "File:Read");

        if (!result) {
            throw new Error("Failed to read file: null result");
        }

        const fileName = sanitizedPath.split(/[\\/]/).pop() || "Untitled";

        const crlfCount = (result.content.match(/\r\n/g) || []).length;
        const lfOnlyCount = (result.content.match(/(?<!\r)\n/g) || []).length;
        const detectedLineEnding: "LF" | "CRLF" =
            crlfCount > 0 && (crlfCount >= lfOnlyCount || lfOnlyCount === 0) ? "CRLF" : "LF";

        let initialTitle = fileName;
        if (appContext.app.tabNameFromContent) {
            const trimmed = result.content.trim();
            if (trimmed.length > 0) {
                const lines = result.content.split("\n");
                const firstLine = lines.find((l) => l.trim().length > 0) || "";
                let smartTitle = firstLine.replace(/^#+\s*/, "").trim();
                const MAX_LEN = 25;
                if (smartTitle.length > MAX_LEN) {
                    smartTitle = smartTitle.substring(0, MAX_LEN).trim() + "...";
                }
                if (smartTitle.length > 0) {
                    initialTitle = smartTitle;
                }
            }
        }

        const id = addTab(initialTitle, result.content);

        // Fetch accurate initial metrics from Rust for large files
        let initialWordCount = 0;
        if (result.content.length > CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES) {
            const metrics = await callBackend(
                "compute_text_metrics",
                { content: result.content },
                "File:Read"
            );
            if (metrics) initialWordCount = metrics[1];
        } else {
            initialWordCount = countWords(result.content);
        }

        updateTabMetadataAndPath(id, {
            path: sanitizedPath,
            isDirty: false,
            lineEnding: detectedLineEnding,
            encoding: result.encoding.toUpperCase(),
            fileCheckPerformed: false,
            sizeBytes: new TextEncoder().encode(result.content).length,
            wordCount: initialWordCount,
        });

        await refreshMetadata(id, sanitizedPath);
        await checkFileExists(id);
        await fileWatcher.watch(sanitizedPath);
        appContext.app.activeTabId = id;
    } catch (err) {
        AppError.handle("File:Read", err, {
            showToast: true,
            additionalInfo: { path },
        });
    }
}

export async function openFileByPath(path: string): Promise<void> {
    await openFile(path);
}

export async function navigateToPath(clickedPath: string): Promise<void> {
    const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);

    if (!clickedPath || clickedPath.length > 1024 || clickedPath.includes("\n")) {
        return;
    }

    try {
        const resolvedPath = await callBackend(
            "resolve_path_relative",
            {
                basePath: activeTab?.path || null,
                clickPath: clickedPath.replace(/\\/g, "/"),
            },
            "File:Read"
        );

        if (!resolvedPath) {
            return;
        }

        await openPath(resolvedPath);
    } catch (err) {
        // Silent failure
    }
}

export async function saveCurrentFile(): Promise<boolean> {
    return saveFile(false);
}

export async function saveCurrentFileAs(): Promise<boolean> {
    return saveFile(true);
}

async function saveFile(forceNewPath: boolean): Promise<boolean> {
    const tabId = appContext.app.activeTabId;
    if (!tabId) return false;

    const tab = appContext.editor.tabs.find((t) => t.id === tabId);
    if (!tab) return false;

    const oldPath = tab.path;

    try {
        // For normal save: use existing path if it exists
        // For save as: always force new path selection
        let savePath: string | null = null;
        
        if (!forceNewPath && tab.path) {
            // Normal save with existing path - use it directly
            savePath = tab.path;
        } else {
            // Show file picker: either forced save-as OR new file
            const preferredExt = tab.preferredExtension || "md";

            if (preferredExt === "txt") {
                savePath = await save({
                    filters: [
                        { name: "Text", extensions: ["txt"] },
                        { name: "Markdown", extensions: ["md"] },
                        { name: "All Files", extensions: ["*"] },
                    ],
                });
            } else {
                savePath = await save({
                    filters: [
                        { name: "Markdown", extensions: ["md"] },
                        { name: "Text", extensions: ["txt"] },
                        { name: "All Files", extensions: ["*"] },
                    ],
                });
            }
        }

        if (savePath) {
            const sanitizedPath = sanitizePath(savePath);
            let contentToSave = tab.content;

            if (appContext.app.formatOnSave && isMarkdownFile(sanitizedPath)) {
                const formatted = await formatMarkdown(contentToSave, {
                    listIndent: appContext.app.defaultIndent,
                    bulletChar: appContext.app.formatterBulletChar,
                    codeBlockFence: appContext.app.formatterCodeFence,
                    tableAlignment: appContext.app.formatterTableAlignment,
                });
                if (formatted && formatted !== contentToSave) {
                    contentToSave = formatted;
                    updateContentOnly(tabId, contentToSave, true);
                }
            }

            const targetLineEnding =
                appContext.app.lineEndingPreference === "system"
                    ? tab.lineEnding || "LF"
                    : appContext.app.lineEndingPreference;

            if (targetLineEnding === "CRLF") {
                contentToSave = contentToSave.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
            } else {
                contentToSave = contentToSave.replace(/\r\n/g, "\n");
            }

            // Explicitly lock the path to prevent the watcher from triggering a reload
            fileWatcher.setWriteLock(sanitizedPath, true);

            try {
                await callBackend(
                    "write_text_file",
                    { path: sanitizedPath, content: contentToSave },
                    "File:Write",
                    undefined,
                    { report: true, msg: "Failed to save file" }
                );

                if (oldPath && oldPath !== sanitizedPath) {
                    fileWatcher.unwatch(oldPath);
                }
                if (oldPath !== sanitizedPath) {
                    await fileWatcher.watch(sanitizedPath);
                }

                const fileName = sanitizedPath.split(/[\\/]/).pop() || "Untitled";

                let finalTitle = fileName;
                if (appContext.app.tabNameFromContent) {
                    const trimmed = contentToSave.trim();
                    if (trimmed.length > 0) {
                        const lines = contentToSave.split("\n");
                        const firstLine = lines.find((l) => l.trim().length > 0) || "";
                        let smartTitle = firstLine.replace(/^#+\s*/, "").trim();
                        const MAX_LEN = 25;
                        if (smartTitle.length > MAX_LEN) {
                            smartTitle = smartTitle.substring(0, MAX_LEN).trim() + "...";
                        }
                        if (smartTitle.length > 0) {
                            finalTitle = smartTitle;
                        }
                    }
                }

                saveTabComplete(tabId, sanitizedPath, finalTitle, targetLineEnding);
                markAsSaved(tabId);

                invalidateMetadataCache(sanitizedPath);
                // Refresh metadata records the new disk modification time in the tab state,
                // acting as a second layer of defense for the watcher.
                await refreshMetadata(tabId, sanitizedPath);
            } finally {
                fileWatcher.setWriteLock(sanitizedPath, false);
            }

            return true;
        }
        return false;
    } catch (err) {
        return false;
    }
}

export async function requestCloseTab(id: string, force = false): Promise<void> {
    const tab = appContext.editor.tabs.find((t) => t.id === id);
    if (!tab || (tab.isPinned && !force)) return;

    if (tab.isDirty && tab.content.trim().length > 0) {
        const result = await confirmDialog({
            title: "Unsaved Changes",
            message: `Do you want to save changes to ${tab.title}?`,
        });

        if (result === "cancel") return;
        if (result === "save") {
            const prev = appContext.app.activeTabId;
            appContext.app.activeTabId = id;
            if (!(await saveCurrentFile())) {
                appContext.app.activeTabId = prev;
                return;
            }
        }
    }

    if (tab.path) {
        fileWatcher.unwatch(tab.path);
    }

    // Tab is removed from store here
    closeTab(id);

    // Update active tab ID from the refreshed MRU stack
    if (appContext.app.activeTabId === id) {
        appContext.app.activeTabId = appContext.editor.mruStack[0] || null;
    }

    // Ensure at least one tab exists
    if (appContext.editor.tabs.length === 0) {
        const newId = addTab();
        appContext.app.activeTabId = newId;
    }

    persistSessionDebounced();
}

export function triggerReopenClosedTab(historyIndex: number): void {
    const reopenedTabId = reopenClosedTab(historyIndex);
    if (reopenedTabId) {
        appContext.app.activeTabId = reopenedTabId;
        persistSessionDebounced();
    }
}

export async function renameFile(tabId: string, newName: string): Promise<boolean> {
    const tab = appContext.editor.tabs.find((t) => t.id === tabId);
    if (!tab) return false;

    const cleanNewName = newName.trim();
    if (!cleanNewName) return false;

    if (!tab.path) {
        updateTabTitle(tabId, cleanNewName, cleanNewName);
        return true;
    }

    try {
        const oldPath = sanitizePath(tab.path);
        const pathParts = oldPath.split("/");
        const oldFileName = pathParts.pop() || "";
        const directory = pathParts.join("/");

        let finalNewName = cleanNewName;
        const oldExt = oldFileName.includes(".") ? oldFileName.split(".").pop() : "";
        const newExt = cleanNewName.includes(".") ? cleanNewName.split(".").pop() : "";

        if (oldExt && !newExt) {
            finalNewName = `${cleanNewName}.${oldExt}`;
        }

        const newPath = `${directory}/${finalNewName}`;

        if (oldPath === newPath) return true;

        await callBackend(
            "rename_file",
            { oldPath: oldPath, newPath: newPath },
            "File:Write",
            undefined,
            { report: true, msg: "Failed to rename file" }
        );

        fileWatcher.unwatch(oldPath);
        await fileWatcher.watch(newPath);

        updateTabMetadataAndPath(tabId, {
            path: newPath,
            title: finalNewName,
            customTitle: finalNewName,
        });

        invalidateMetadataCache(newPath);
        await refreshMetadata(tabId, newPath);

        const bookmark = getBookmarkByPath(oldPath);
        if (bookmark) {
            await updateBookmark(bookmark.id, finalNewName, bookmark.tags, newPath);
        }

        showToast("success", `Renamed to ${finalNewName}`);
        return true;
    } catch (err) {
        return false;
    }
}
