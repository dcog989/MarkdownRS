import { appState } from '$lib/stores/appState.svelte.ts';
import { dialogStore } from '$lib/stores/dialogStore.svelte.ts';
import { editorStore, type EditorTab } from '$lib/stores/editorStore.svelte.ts';
import { AppError } from './errorHandling';
import { formatMarkdown } from './formatter';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

type RustTabState = {
    id: string;
    title: string;
    content: string;
    is_dirty: boolean;
    path: string | null;
    scroll_percentage: number;
    created: string | null;
    modified: string | null;
    is_pinned: boolean;
    custom_title: string | null;
    file_check_failed?: boolean;
    file_check_performed?: boolean;
};

type FileMetadata = {
    created?: string;
    modified?: string;
};

type FileContent = {
    content: string;
    encoding: string;
};

let isSaving = false;
let saveQueue: (() => Promise<void>)[] = [];

/**
 * Refresh file metadata (created/modified dates) for a tab
 * @param tabId - The tab ID to update
 * @param path - The file path to get metadata from
 */
async function refreshMetadata(tabId: string, path: string) {
    try {
        const meta = await invoke<FileMetadata>('get_file_metadata', { path });
        editorStore.updateMetadata(tabId, meta.created, meta.modified);
    } catch (e) {
        AppError.log('File:Metadata', e, { tabId, path });
    }
}

function sanitizePath(path: string): string {
    return path.replace(/\0/g, '').replace(/\\/g, '/');
}

/**
 * Open a file dialog and load the selected file into a new tab
 */
export async function openFile(): Promise<void> {
    try {
        const selected = await open({
            multiple: false,
            filters: [{
                name: 'Markdown',
                extensions: ['md', 'markdown', 'txt', 'rs', 'js', 'ts', 'svelte', 'json']
            }]
        });

        if (selected && typeof selected === 'string') {
            const sanitizedPath = sanitizePath(selected);
            const result = await invoke<FileContent>('read_text_file', { path: sanitizedPath });
            const fileName = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';

            // Detect Line Ending based on raw content
            // More robust detection: count occurrences and use majority
            const crlfCount = (result.content.match(/\r\n/g) || []).length;
            const lfOnlyCount = (result.content.match(/(?<!\r)\n/g) || []).length;
            
            // If more than 50% of line breaks are CRLF, consider it a CRLF file
            let detectedLineEnding: 'LF' | 'CRLF' = 'LF';
            if (crlfCount > 0 && crlfCount >= lfOnlyCount) {
                detectedLineEnding = 'CRLF';
            }

            const id = editorStore.addTab(fileName, result.content);
            const tab = editorStore.tabs.find(t => t.id === id);
            if (tab) {
                tab.path = sanitizedPath;
                tab.isDirty = false;
                tab.lineEnding = detectedLineEnding;
                tab.encoding = result.encoding.toUpperCase();
                await refreshMetadata(id, sanitizedPath);
            }
            appState.activeTabId = id;
            editorStore.pushToMru(id);
        }
    } catch (err) {
        AppError.log('File:Read', err);
    }
}

/**
 * Save the currently active file
 * @returns true if saved successfully, false otherwise
 */
export async function saveCurrentFile(): Promise<boolean> {
    const tabId = appState.activeTabId;
    if (!tabId) return false;

    const tab = editorStore.tabs.find(t => t.id === tabId);
    if (!tab) return false;

    try {
        let savePath = tab.path;

        if (!savePath) {
            savePath = await save({
                filters: [{ name: 'Markdown', extensions: ['md'] }]
            });
        }

        if (savePath) {
            const sanitizedPath = sanitizePath(savePath);

            // Apply formatter if enabled and not a plain text file
            let contentToSave = tab.content;
            if (appState.formatOnSave && !sanitizedPath.endsWith('.txt')) {
                try {
                    contentToSave = formatMarkdown(contentToSave, {
                        listIndent: appState.formatterListIndent,
                        bulletChar: appState.formatterBulletChar,
                        codeBlockFence: appState.formatterCodeFence,
                        tableAlignment: appState.formatterTableAlignment
                    });
                    // Update tab content with formatted version
                    tab.content = contentToSave;
                } catch (err) {
                    console.error('Format on save failed:', err);
                    // Continue with original content if formatting fails
                    contentToSave = tab.content;
                }
            }

            // Handle Line Endings
            if (tab.lineEnding === 'CRLF') {
                // Ensure LF -> CRLF (CodeMirror normalizes to LF internally)
                contentToSave = contentToSave.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
            } else {
                // Ensure LF
                contentToSave = contentToSave.replace(/\r\n/g, '\n');
            }

            await invoke('write_text_file', { path: sanitizedPath, content: contentToSave });
            tab.path = sanitizedPath;
            tab.title = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';
            tab.isDirty = false;
            await refreshMetadata(tabId, sanitizedPath);
            return true;
        }
        return false;
    } catch (err) {
        AppError.log('File:Write', err, { tabId, path: tab?.path });
        return false;
    }
}

/**
 * Request to close a tab, prompting for save if dirty
 * @param id - Tab identifier to close
 * @param force - If true, closes pinned tabs (default: false)
 */
export async function requestCloseTab(id: string, force = false): Promise<void> {
    const tab = editorStore.tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.isPinned && !force) return;

    if (tab.isDirty && tab.content.trim().length > 0) {
        const result = await dialogStore.confirm({
            title: 'Unsaved Changes',
            message: `Do you want to save changes to ${tab.title}?`,
        });

        if (result === 'cancel') {
            return;
        }

        if (result === 'save') {
            const prevActive = appState.activeTabId;
            appState.activeTabId = id;
            const saved = await saveCurrentFile();
            if (!saved) {
                appState.activeTabId = prevActive;
                return;
            }
        }
    }

    editorStore.closeTab(id);

    if (appState.activeTabId === id) {
        let nextId = editorStore.mruStack[0];
        appState.activeTabId = nextId || null;
    }

    if (editorStore.tabs.length === 0) {
        const newId = editorStore.addTab();
        appState.activeTabId = newId;
    }
}

/**
 * Add a word to the custom dictionary file.
 * 
 * NOTE: Browser's native spellcheck does not natively support custom dictionary files.
 * This function stores words in a custom dictionary file that can be read by
 * a CodeMirror extension to supplement the browser's spell checking.
 * 
 * After adding a word, the spell checker should be manually refreshed by calling
 * refreshCustomDictionary() from the spellcheck utility.
 * 
 * @param word - The word to add to the dictionary
 * @returns true if successful, false otherwise
 */
export async function addToDictionary(word: string): Promise<boolean> {
    try {
        await invoke('add_to_dictionary', { word });
        return true;
    } catch (err) {
        AppError.log('Dictionary:Add', err, { word });
        return false;
    }
}

async function processSaveQueue() {
    while (saveQueue.length > 0) {
        const saveTask = saveQueue.shift();
        if (saveTask) {
            try {
                await saveTask();
            } catch (err) {
                AppError.log('Session:Save', err);
            }
        }
    }
    isSaving = false;
}

/**
 * Persist the current session (all tabs) to the database
 * Uses a queue to handle concurrent save requests
 */
export async function persistSession(): Promise<void> {
    if (!editorStore.sessionDirty) return;

    const saveTask = async () => {
        try {
            const plainTabs: RustTabState[] = editorStore.tabs.map(t => ({
                id: t.id,
                path: t.path,
                title: t.title,
                content: t.content,
                is_dirty: t.isDirty,
                scroll_percentage: t.scrollPercentage,
                created: t.created || null,
                modified: t.modified || null,
                is_pinned: t.isPinned || false,
                custom_title: t.customTitle || null,
                file_check_failed: t.fileCheckFailed || false,
                file_check_performed: t.fileCheckPerformed || false
            }));

            await invoke('save_session', { tabs: plainTabs });
            editorStore.sessionDirty = false;
        } catch (err) {
            AppError.log('Session:Save', err);
            // Re-throw to ensure processSaveQueue catches it
            throw err;
        }
    };

    if (isSaving) {
        // Add to queue if already saving
        saveQueue.push(saveTask);
        return;
    }

    isSaving = true;
    try {
        await saveTask();
        await processSaveQueue();
    } catch (err) {
        // Error already logged in saveTask
        isSaving = false;
    }
}

/**
 * Check if a file exists for a specific tab
 * Only checks once per tab (unless fileCheckPerformed is reset)
 */
export async function checkFileExists(tabId: string): Promise<void> {
    const tab = editorStore.tabs.find(t => t.id === tabId);
    if (!tab || !tab.path || tab.fileCheckPerformed) {
        return;
    }
    
    tab.fileCheckPerformed = true;
    
    try {
        // Try to check if file exists by getting metadata
        await invoke('get_file_metadata', { path: tab.path });
        tab.fileCheckFailed = false;
        editorStore.sessionDirty = true;
    } catch (err) {
        // File doesn't exist or can't be accessed
        tab.fileCheckFailed = true;
        editorStore.sessionDirty = true;
    }
}

/**
 * Load the saved session from the database and restore all tabs
 */
export async function loadSession(): Promise<void> {
    try {
        const rustTabs = await invoke<RustTabState[]>('restore_session');
        if (rustTabs && rustTabs.length > 0) {
            const convertedTabs: EditorTab[] = rustTabs.map(t => ({
                id: t.id,
                title: t.title,
                content: t.content,
                isDirty: t.is_dirty,
                path: t.path,
                scrollPercentage: t.scroll_percentage,
                created: t.created || undefined,
                modified: t.modified || undefined,
                isPinned: t.is_pinned,
                customTitle: t.custom_title || undefined,
                lineEnding: t.content.indexOf('\r\n') !== -1 ? 'CRLF' : 'LF',
                encoding: 'UTF-8', // Default from DB until we persist it
                fileCheckFailed: t.file_check_failed || false,
                fileCheckPerformed: t.file_check_performed || false
            }));

            editorStore.tabs = convertedTabs;
            editorStore.mruStack = convertedTabs.map(t => t.id);

            // Handle startup behavior
            switch (appState.startupBehavior) {
                case 'first':
                    appState.activeTabId = convertedTabs[0].id;
                    break;
                case 'last-focused':
                    // MRU stack should have last focused tab first
                    appState.activeTabId = editorStore.mruStack[0] || convertedTabs[0].id;
                    break;
                case 'new':
                    const newId = editorStore.addTab('Untitled');
                    appState.activeTabId = newId;
                    break;
                default:
                    appState.activeTabId = convertedTabs[0].id;
            }

            const metadataPromises = convertedTabs
                .filter(t => t.path)
                .map(t => refreshMetadata(t.id, t.path!));

            Promise.all(metadataPromises).catch(err =>
                console.error('Failed to refresh metadata for some tabs:', err)
            );
        } else {
            const id = editorStore.addTab('Untitled-1', '# Welcome to MarkdownRS\n');
            appState.activeTabId = id;
        }
    } catch (err) {
        AppError.log('Session:Load', err);
        const id = editorStore.addTab('Untitled-1', '# Welcome to MarkdownRS\n');
        appState.activeTabId = id;
    }
}
