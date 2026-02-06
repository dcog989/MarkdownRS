// Application Configuration Constants
// Centralized configuration to avoid magic numbers throughout the codebase

const DEFAULT_CONFIG = {
    // Editor Settings
    EDITOR: {
        CONTENT_DEBOUNCE_MS: 80,
        METRICS_DEBOUNCE_MS: 80,
        SCROLL_DEBOUNCE_MS: 150,
        SEARCH_DEBOUNCE_MS: 150,
        MAX_FILE_SIZE_MB: 50,
        SMART_TITLE_MAX_LENGTH: 25,
        CLOSED_TABS_HISTORY_LIMIT: 12,
        LINE_CHANGE_TRACK_LIMIT: 50,
    },

    // Spellcheck Settings
    SPELLCHECK: {
        LINT_DELAY_MS: 750,
        STARTUP_DELAY_MS: 200,
        REFRESH_DELAY_MS: 50,
    },

    // Tab Settings
    TABS: {
        WIDTH_MIN: 100,
        WIDTH_MAX: 200,
        SCROLL_CHECK_INTERVAL_MS: 500,
        SCROLL_CHECK_THROTTLE_MS: 50,
        SCROLL_AMOUNT_PX: 200,
    },

    // Split View
    SPLIT: {
        MIN_PERCENTAGE: 0.1,
        MAX_PERCENTAGE: 0.9,
        DEFAULT_PERCENTAGE: 0.5,
        SNAP_THRESHOLD_PX: 10,
    },

    // Session & Auto-save
    SESSION: {
        AUTO_SAVE_INTERVAL_MS: 5000, // Main auto-save interval for session persistence
        SETTINGS_SAVE_INTERVAL_MS: 5000, // Settings auto-save interval (same as session for consistency)
        SAVE_DEBOUNCE_MS: 500,
        SAVE_ON_BLUR: true,
    },

    // Performance
    PERFORMANCE: {
        LARGE_FILE_THRESHOLD_LINES: 10000,
        LARGE_FILE_SIZE_BYTES: 500000,
        SCROLL_SYNC_THRESHOLD_PX: 10,
        SCROLL_SYNC_THROTTLE_MS: 16,
        SCROLL_SYNC_RESIZE_DEBOUNCE_MS: 200,
        FILE_WATCH_DEBOUNCE_MS: 300,
        WORD_COUNT_DEBOUNCE_MS: 500,
        PREVIEW_RENDER_DEBOUNCE_MS: 250,
        PREVIEW_SPINNER_DELAY_MS: 500,
        FILE_WATCHER_LOCK_BUFFER_MS: 700,
        INCREMENTAL_RENDER_MIN_SIZE: 1000,
        INCREMENTAL_BLOCK_SIZE_LIMIT: 200,
        INCREMENTAL_CACHE_LIMIT: 1000,
    },

    // UI Timing - Delays and debounces for UI interactions
    UI_TIMING: {
        // Focus delays - Allow DOM updates before focusing elements
        FOCUS_DELAY_MS: 50, // TabDropdown, BookmarksModal, RecentFilesModal, SettingsModal
        FOCUS_IMMEDIATE_MS: 0, // Immediate focus (BookmarksModal, RecentFilesModal, SettingsModal)

        // Keyboard navigation
        MRU_POPUP_DELAY_MS: 200, // Delay before showing MRU popup during tab cycling (TabBar)
        TAB_SWITCH_ANIMATION_MS: 50, // Animation delay for tab switching (Editor)

        // Scroll behavior
        TAB_SCROLL_SETTLE_MS: 300, // Wait for scroll to settle before centering active tab (TabBar)
        MOUSE_MOVEMENT_IGNORE_MS: 50, // Ignore mouse movement after keyboard nav (TabDropdown)

        // Export & Cleanup
        EXPORT_RENDER_WAIT_MS: 150, // Wait for styles to apply before export (exportService)
        EXPORT_CLEANUP_DELAY_MS: 500, // Delay before cleaning up export content (exportService)

        // State restoration
        RESTORE_STATE_DELAY_MS: 100, // Delay before marking restoration complete (EditorView)

        // Spellcheck refresh
        SPELLCHECK_REFRESH_DELAY_MS: 100, // Delay before refreshing spellcheck (Editor)

        // Update status auto-hide
        UPDATE_STATUS_HIDE_MS: 3000, // Auto-hide update status message (AboutModal)

        // Context menu
        CONTEXT_MENU_UPDATE_DELAY_MS: 0, // Delay before updating context menu items (ContextMenu)
        SUBMENU_HOVER_CLOSE_DELAY_MS: 300, // Delay before closing submenu on hover out (Submenu)

        // Modal focus
        MODAL_FOCUS_DELAY_MS: 0, // Delay before focusing modal elements (Modal)

        // Find/Replace panel
        FIND_PANEL_FOCUS_CHECK_MS: 0, // Delay before checking if find panel should focus (FindReplacePanel)
    },

    // UI Appearance
    UI: {
        ANIMATION_DURATION_MS: 250,
        TOAST_DURATION_MS: 3000,
        TOOLTIP_OFFSET_Y: 20,
        TOOLTIP_SCREEN_PADDING: 10,
        TOOLTIP_FLIP_OFFSET: 5,
    },
};

export type AppConfig = typeof DEFAULT_CONFIG;

/**
 * Validates and merges configuration overrides.
 * Ensures types are correct and numeric values are within safe runtime ranges.
 */
function validateConfig(overrides: Partial<AppConfig>): AppConfig {
    const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validate = (target: any, source: any) => {
        for (const key in source) {
            if (
                source[key] !== null &&
                typeof source[key] === 'object' &&
                !Array.isArray(source[key])
            ) {
                if (!target[key]) target[key] = {};
                validate(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    };

    validate(merged, overrides);

    // Runtime Range Validation
    merged.EDITOR.MAX_FILE_SIZE_MB = Math.max(1, Math.min(500, merged.EDITOR.MAX_FILE_SIZE_MB));
    merged.EDITOR.CONTENT_DEBOUNCE_MS = Math.max(10, merged.EDITOR.CONTENT_DEBOUNCE_MS);

    merged.SPLIT.MIN_PERCENTAGE = Math.max(0, Math.min(0.45, merged.SPLIT.MIN_PERCENTAGE));
    merged.SPLIT.MAX_PERCENTAGE = Math.max(0.55, Math.min(1, merged.SPLIT.MAX_PERCENTAGE));

    merged.PERFORMANCE.SCROLL_SYNC_THROTTLE_MS = Math.max(
        8,
        merged.PERFORMANCE.SCROLL_SYNC_THROTTLE_MS,
    );

    return merged;
}

// Global immutable configuration instance
export const CONFIG: AppConfig = Object.freeze(validateConfig(DEFAULT_CONFIG));
