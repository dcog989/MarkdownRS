import { appState } from '$lib/stores/appState.svelte';
import {
    addTab,
    editorStore,
    getTransientState,
    initTransientState,
    markTabPersisted,
    setFileCheckStatus,
    setLineChangeTracker,
    updateTransientState,
} from '$lib/stores/editorStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { formatTimestampForDisplay } from '$lib/utils/date';
import { AppError } from '$lib/utils/errorHandling';
import { hashContent } from '$lib/utils/contentHash';
import { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { logger } from '$lib/utils/logger';
import { countWords, fastCountWords } from '$lib/utils/textMetrics';
import { debounce } from '$lib/utils/timing';
import {
    checkAndReloadIfChanged,
    checkFileExists,
    normalizeLineEndings,
    refreshMetadata,
    reloadFileContent,
} from './fileMetadata';
import { fileWatcher } from './fileWatcher';

// Only import types if needed
import type { EditorTab } from '$lib/stores/editorStore.svelte';

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
    private saveQueue = Promise.resolve();
    private savePending = false;

    async requestSave(): Promise<void> {
        if (!editorStore.sessionDirty) {
            return;
        }

        if (!this.savePending) {
            this.savePending = true;
            this.saveQueue = this.saveQueue.then(async () => {
                await this.executeSave();
                this.savePending = false;
            });
        }
    }

    private async executeSave(): Promise<void> {
        const start = performance.now();

        try {
            const mruPositionMap = new Map<string, number>();
            editorStore.mruStack.forEach((tabId, index) => mruPositionMap.set(tabId, index));

            // 1. Map Active Tabs
            const activeTabs = editorStore.tabs;
            const activeRustTabs: RustTabState[] = activeTabs.map((t, index) => {
                const ts = getTransientState(t.id);
                const needsContent = ts ? ts.contentChanged || !ts.isPersisted : true;

                return {
                    id: t.id,
                    path: t.path,
                    title: t.title,
                    content: needsContent ? t.content : null,
                    is_dirty: t.isDirty,
                    scroll_percentage: ts?.scrollPercentage ?? 0,
                    created: t.created || null,
                    modified: t.modified || null,
                    is_pinned: t.isPinned || false,
                    custom_title: t.customTitle || null,
                    file_check_failed: t.fileCheckFailed || false,
                    file_check_performed: ts?.fileCheckPerformed ?? false,
                    mru_position: mruPositionMap.get(t.id) ?? null,
                    sort_index: index,
                    original_index: null,
                };
            });

            // 2. Map Closed Tabs
            const closedTabs: RustTabState[] = editorStore.closedTabsHistory.map((entry, index) => {
                const ts = getTransientState(entry.tab.id);
                const needsContent =
                    entry.tab.contentLoaded && (ts ? ts.contentChanged || !ts.isPersisted : true);

                return {
                    id: entry.tab.id,
                    path: entry.tab.path,
                    title: entry.tab.title,
                    content: needsContent ? entry.tab.content : null,
                    is_dirty: entry.tab.isDirty,
                    scroll_percentage: ts?.scrollPercentage ?? 0,
                    created: entry.tab.created || null,
                    modified: entry.tab.modified || null,
                    is_pinned: entry.tab.isPinned || false,
                    custom_title: entry.tab.customTitle || null,
                    file_check_failed: entry.tab.fileCheckFailed || false,
                    file_check_performed: ts?.fileCheckPerformed ?? false,
                    mru_position: null,
                    sort_index: index,
                    original_index: entry.index,
                };
            });

            await callBackend(
                'save_session',
                { activeTabs: activeRustTabs, closedTabs: closedTabs },
                'Session:Save',
            );

            const duration = (performance.now() - start).toFixed(2);
            const tabsWithContent = activeRustTabs.filter((t) => t.content !== null).length;
            logger.session.info('SessionSaved', {
                duration: `${duration}ms`,
                activeTabs: activeRustTabs.length,
                closedTabs: closedTabs.length,
                withContent: tabsWithContent,
            });

            // 3. Update persistence state on success
            editorStore.sessionDirty = false;

            activeTabs.forEach((t) => {
                markTabPersisted(t.id);
            });

            editorStore.closedTabsHistory.forEach((entry) => {
                updateTransientState(entry.tab.id, { contentChanged: false, isPersisted: true });
            });
        } catch (err) {
            editorStore.sessionDirty = true;
            AppError.handle('Session:Save', err, {
                showToast: false,
                severity: 'warning',
            });
        }
    }
}

const persistenceManager = new SessionPersistenceManager();

export async function initializeTabFileState(tab: EditorTab): Promise<void> {
    if (!tab.path) {
        return;
    }

    // First check if the file exists
    try {
        await callBackend('get_file_metadata', { path: tab.path }, 'File:Metadata');
    } catch {
        // File doesn't exist, mark as such and skip further operations
        setFileCheckStatus(tab.id, true, true);
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
            const res = await callBackend('read_text_file', { path: tab.path }, 'File:Read');

            if (!res) {
                throw new Error('Failed to read file: null result');
            }

            const storeTab = editorStore.tabs.find((x) => x.id === tab.id);
            if (storeTab) {
                const normalizedContent = normalizeLineEndings(res.content);
                storeTab.lastSavedHash = hashContent(normalizedContent);
                storeTab.isDirty = hashContent(storeTab.content) !== storeTab.lastSavedHash;
            }
        } catch (err) {
            AppError.handle('File:Read', err, {
                showToast: false,
                severity: 'warning',
                additionalInfo: { path: tab.path },
            });
        }
    }

    await refreshMetadata(tab.id, tab.path);
    await checkFileExists(tab.id);

    try {
        await fileWatcher.watch(tab.path);
    } catch (err) {
        AppError.handle('FileWatcher:Watch', err, {
            showToast: false,
            severity: 'warning',
            additionalInfo: { path: tab.path },
        });
    }
}

export async function persistSession(): Promise<void> {
    await persistenceManager.requestSave();
}

enum TabLoadState {
    UNLOADED = 'UNLOADED',
    LOADING = 'LOADING',
    LOADED = 'LOADED',
    ERROR = 'ERROR',
}

const tabLoadStates = new Map<string, TabLoadState>();

export function initializeTabLoadState(tabId: string, contentLoaded: boolean = true): void {
    tabLoadStates.set(tabId, contentLoaded ? TabLoadState.LOADED : TabLoadState.UNLOADED);
}

function validateTransition(currentState: TabLoadState, nextState: TabLoadState): boolean {
    const validTransitions: Record<TabLoadState, TabLoadState[]> = {
        [TabLoadState.UNLOADED]: [TabLoadState.LOADING],
        [TabLoadState.LOADING]: [TabLoadState.LOADED, TabLoadState.ERROR],
        [TabLoadState.LOADED]: [],
        [TabLoadState.ERROR]: [TabLoadState.LOADING],
    };

    return validTransitions[currentState]?.includes(nextState) ?? false;
}

function setTabLoadState(tabId: string, state: TabLoadState): void {
    const currentState = tabLoadStates.get(tabId) ?? TabLoadState.UNLOADED;
    if (!validateTransition(currentState, state)) {
        logger.session.warn('InvalidTabStateTransition', {
            tabId,
            from: currentState,
            to: state,
        });
        return;
    }

    tabLoadStates.set(tabId, state);
}

/**
 * Lazy load content for a tab from the database
 *
 * State Machine Transitions:
 * - UNLOADED → LOADING → LOADED (success path)
 * - UNLOADED → LOADING → ERROR → LOADING → LOADED (retry path)
 */
const loadingRequests = new Map<string, number>();

export async function loadTabContentLazy(tabId: string): Promise<void> {
    const start = performance.now();
    const index = editorStore.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) {
        return;
    }

    const tab = editorStore.tabs[index];
    const currentState = tabLoadStates.get(tabId) ?? TabLoadState.UNLOADED;

    if (currentState === TabLoadState.LOADED || tab.contentLoaded) {
        return;
    }

    if (currentState === TabLoadState.LOADING) {
        return;
    }

    setTabLoadState(tabId, TabLoadState.LOADING);

    const requestId = Date.now();
    loadingRequests.set(tabId, requestId);

    try {
        const data = await callBackend('load_tab_content', { tabId }, 'Session:Load');

        if (loadingRequests.get(tabId) !== requestId) {
            return;
        }

        const currentActiveId = appState.activeTabId;
        if (currentActiveId !== tabId) {
            logger.session.debug('TabSwitchedDuringLoad', { tabId, currentActiveId });
            return;
        }

        let normalizedContent = '';
        let lastSavedHash = '';

        if (data && data.content !== null && data.content !== undefined && data.content !== '') {
            normalizedContent = normalizeLineEndings(data.content);
            logger.session.debug('ContentLoadedFromDb', {
                tabId,
                contentLength: normalizedContent.length,
                path: tab.path,
            });

            if (!tab.path) {
                lastSavedHash = '';
            } else if (tab.isDirty) {
                try {
                    const fileData = await callBackend(
                        'read_text_file',
                        { path: tab.path },
                        'File:Read',
                    );
                    if (fileData && fileData.content) {
                        lastSavedHash = hashContent(normalizeLineEndings(fileData.content));
                    } else {
                        lastSavedHash = hashContent(normalizedContent);
                    }
                } catch {
                    lastSavedHash = hashContent(normalizedContent);
                }
            } else {
                lastSavedHash = hashContent(normalizedContent);
            }
        } else {
            // No content in database - this shouldn't happen for saved files
            logger.session.warn('NoContentInDatabase', {
                tabId,
                path: tab.path,
                hasData: !!data,
                contentLength: data?.content?.length ?? 0,
            });
            normalizedContent = '';
            lastSavedHash = '';
        }

        const sizeBytes = new TextEncoder().encode(normalizedContent).length;
        const wordCount =
            sizeBytes < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES
                ? countWords(normalizedContent)
                : fastCountWords(normalizedContent);

        const currentIndex = editorStore.tabs.findIndex((t) => t.id === tabId);
        if (currentIndex !== -1) {
            const currentTab = editorStore.tabs[currentIndex];
            editorStore.tabs[currentIndex] = {
                ...currentTab,
                content: normalizedContent,
                lastSavedHash,
                sizeBytes,
                wordCount,
                lineEnding: normalizedContent.indexOf('\r\n') !== -1 ? 'CRLF' : 'LF',
                contentLoaded: true,
                isDirty: tab.isDirty && hashContent(normalizedContent) !== lastSavedHash,
            };

            logger.session.info('TabContentLoaded', {
                tabId,
                sizeBytes,
                wordCount,
                path: tab.path,
            });
        }

        setTabLoadState(tabId, TabLoadState.LOADED);

        const duration = (performance.now() - start).toFixed(2);
        logger.session.debug('TabContentLazyLoaded', {
            duration: `${duration}ms`,
            tabId,
            size: sizeBytes,
        });
    } catch (err) {
        if (loadingRequests.get(tabId) === requestId) {
            setTabLoadState(tabId, TabLoadState.ERROR);

            AppError.handle('Session:Load', err, {
                showToast: false,
                severity: 'warning',
                additionalInfo: { tabId },
            });

            const currentIndex = editorStore.tabs.findIndex((t) => t.id === tabId);
            if (currentIndex !== -1) {
                editorStore.tabs[currentIndex].contentLoaded = false;
            }
        }
    } finally {
        if (loadingRequests.get(tabId) === requestId) {
            loadingRequests.delete(tabId);
        }
    }
}

function convertRustTabToEditorTab(t: RustTabState, contentLoaded: boolean = true): EditorTab {
    const rawContent = t.content || '';
    const content = normalizeLineEndings(rawContent);
    const timestamp = t.modified || t.created || '';

    const lastSavedHash = !t.path ? '' : hashContent(content);
    const sizeBytes = new TextEncoder().encode(content).length;

    const lineArray = content.split('\n');
    const lineCount = lineArray.length;
    // Use reduce instead of Math.max(...spread) to avoid stack overflow with large files
    const widestColumn = lineArray.reduce((max, line) => Math.max(max, line.length), 0);

    const wordCount =
        sizeBytes < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES
            ? countWords(content)
            : fastCountWords(content);

    const editorTab: EditorTab = {
        id: t.id,
        title: t.title,
        originalTitle: t.title,
        content,
        lastSavedHash,
        isDirty: t.is_dirty,
        path: t.path,
        sizeBytes,
        wordCount,
        lineCount,
        widestColumn,
        cursor: { anchor: 0, head: 0 },
        created: t.created || undefined,
        modified: t.modified || undefined,
        formattedTimestamp: formatTimestampForDisplay(timestamp),
        isPinned: t.is_pinned,
        customTitle: t.custom_title || undefined,
        lineEnding: (t.content && t.content.indexOf('\r\n') !== -1 ? 'CRLF' : 'LF') as
            | 'LF'
            | 'CRLF',
        encoding: 'UTF-8',
        fileCheckFailed: t.file_check_failed || false,
        contentLoaded,
    };

    setLineChangeTracker(t.id, new LineChangeTracker());
    initTransientState(
        t.id,
        {
            scrollPercentage: t.scroll_percentage,
            contentChanged: contentLoaded
                ? t.is_dirty || (!t.path && content.length > 0)
                : t.is_dirty,
            isPersisted: true,
            fileCheckPerformed: t.file_check_performed || false,
        },
        sizeBytes,
    );

    return editorTab;
}

export async function loadSession(): Promise<void> {
    const start = performance.now();

    try {
        const sessionData = await callBackend('restore_session', {}, 'Session:Load');

        let activeRustTabs: RustTabState[] = [];
        let closedRustTabs: RustTabState[] = [];

        if (Array.isArray(sessionData)) {
            activeRustTabs = sessionData as RustTabState[];
        } else if (sessionData && typeof sessionData === 'object') {
            const sd = sessionData as { active_tabs?: unknown[]; closed_tabs?: unknown[] };
            activeRustTabs = (sd.active_tabs || []) as RustTabState[];
            closedRustTabs = (sd.closed_tabs || []) as RustTabState[];
        }

        if (activeRustTabs.length > 0) {
            activeRustTabs.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));

            // Convert tabs without content - lazy loader fetches content on first activation
            const convertedTabs: EditorTab[] = activeRustTabs.map((t) => {
                const tab = convertRustTabToEditorTab(t, false);
                return tab;
            });

            editorStore.tabs = convertedTabs;

            convertedTabs.forEach((tab) => {
                initializeTabLoadState(tab.id, false);
            });

            const sortedMru = activeRustTabs
                .filter((t) => t.mru_position !== null && t.mru_position !== undefined)
                .sort((a, b) => (a.mru_position || 0) - (b.mru_position || 0))
                .map((t) => t.id);

            editorStore.mruStack =
                sortedMru.length > 0 ? sortedMru : convertedTabs.map((t) => t.id);

            // Initialize Active Tab Logic

            switch (appState.startupBehavior) {
                case 'first':
                    appState.activeTabId = convertedTabs[0].id;

                    break;
                case 'last-focused':
                    appState.activeTabId = editorStore.mruStack[0] || convertedTabs[0].id;

                    break;
                case 'new':
                    break;
                default:
                    appState.activeTabId = convertedTabs[0].id;
            }

            const activeTab = editorStore.tabs.find((t) => t.id === appState.activeTabId);
            if (activeTab) {
                // Load active tab content immediately - the lazy loader in +page.svelte misses
                // the initial activation because isInitialized is still false at that point.
                await loadTabContentLazy(activeTab.id);
                await initializeTabFileState(activeTab);
            }
        }

        // Ensure there's always one tab if empty or requested "new"
        if (editorStore.tabs.length === 0 || appState.startupBehavior === 'new') {
            if (appState.startupBehavior === 'new' && activeRustTabs.length > 0) {
                appState.activeTabId = addTab();
            } else if (editorStore.tabs.length === 0) {
                appState.activeTabId = addTab();
            }
        }

        if (closedRustTabs.length > 0) {
            closedRustTabs.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));

            editorStore.closedTabsHistory = closedRustTabs.map((t) => {
                const tab = convertRustTabToEditorTab(t, false);
                initializeTabLoadState(tab.id, false);

                return {
                    tab,
                    index: t.original_index ?? 0,
                };
            });
        }

        // Set sessionDirty if there are unsaved tabs with content
        const hasUnsavedTabsWithContent = editorStore.tabs.some(
            (t) => !t.path && t.content.length > 0,
        );
        editorStore.sessionDirty = hasUnsavedTabsWithContent;

        const duration = (performance.now() - start).toFixed(2);
        logger.session.info('SessionLoaded', {
            duration: `${duration}ms`,
            activeTabs: editorStore.tabs.length,
            closedTabs: editorStore.closedTabsHistory.length,
        });
    } catch (err) {
        AppError.handle('Session:Load', err, {
            showToast: false,
            severity: 'warning',
        });

        appState.activeTabId = addTab();
    }
}

export const persistSessionDebounced = debounce(persistSession, CONFIG.SESSION.SAVE_DEBOUNCE_MS);
