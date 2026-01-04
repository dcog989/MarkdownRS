// Application Configuration Constants
// Centralized configuration to avoid magic numbers throughout the codebase

export const CONFIG = {
    // Editor Settings
    EDITOR: {
        CONTENT_DEBOUNCE_MS: 80,
        METRICS_DEBOUNCE_MS: 80,
        SCROLL_DEBOUNCE_MS: 150,
        SEARCH_DEBOUNCE_MS: 150,
        MAX_FILE_SIZE_MB: 50,
        SMART_TITLE_MAX_LENGTH: 25,
    },

    // Spellcheck Settings
    SPELLCHECK: {
        LINT_DELAY_MS: 350,
        STARTUP_DELAY_MS: 200,
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
        AUTO_SAVE_INTERVAL_MS: 30000,
        SAVE_DEBOUNCE_MS: 500,
        SAVE_ON_BLUR: true,
    },

    // Performance
    PERFORMANCE: {
        LARGE_FILE_THRESHOLD_LINES: 10000,
        SCROLL_SYNC_THRESHOLD_PX: 10,
        SCROLL_SYNC_THROTTLE_MS: 16,
        FILE_WATCH_DEBOUNCE_MS: 300,
    },

    // UI
    UI: {
        ANIMATION_DURATION_MS: 250,
        TOAST_DURATION_MS: 3000,
        TOOLTIP_OFFSET_Y: 20,
        TOOLTIP_SCREEN_PADDING: 10,
        TOOLTIP_FLIP_OFFSET: 5,
    },
} as const;

// Type-safe configuration access
export type AppConfig = typeof CONFIG;
