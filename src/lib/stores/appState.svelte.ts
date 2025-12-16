export class AppState {
    activeTabId = $state<string | null>(null);
    splitView = $state(true);
    theme = $state<'dark' | 'light'>('dark');

    // Layout State
    splitPercentage = $state(0.5);
    splitOrientation = $state<'vertical' | 'horizontal'>('vertical');

    // Preferences
    tabCycling = $state<'mru' | 'sequential'>('mru'); // Fixed: Default to MRU
    tabWidthMin = $state(100);
    tabWidthMax = $state(200);
    statusBarTransparency = $state(0); // 0 to 100
    newTabPosition = $state<'right' | 'end'>('end');
    startupBehavior = $state<'first' | 'last-focused' | 'new'>('last-focused');

    // Editor & Preview Settings
    editorFontFamily = $state("Consolas, 'Courier New', monospace");
    editorFontSize = $state(14);
    editorWordWrap = $state(true); // Fixed: Default to true
    enableAutocomplete = $state(true);
    previewFontFamily = $state("system-ui, -apple-system, sans-serif");
    previewFontSize = $state(16);

    // Advanced Settings
    logLevel = $state<'trace' | 'debug' | 'info' | 'warn' | 'error'>('info');

    // Formatter Settings
    formatOnSave = $state(false);
    formatOnPaste = $state(false);
    formatterListIndent = $state(2);
    formatterBulletChar = $state<'-' | '*' | '+'>('-');
    formatterCodeFence = $state<'```' | '~~~'>('```');
    formatterTableAlignment = $state(true);

    // Line Ending Preference
    lineEndingPreference = $state<'system' | 'LF' | 'CRLF'>('system');

    // Tooltip Settings
    tooltipDelay = $state(1000); // milliseconds

    constructor() {
        // Initialization logic
    }

    toggleSplitView() {
        this.splitView = !this.splitView;
    }

    setTheme(newTheme: 'dark' | 'light') {
        this.theme = newTheme;
    }

    toggleOrientation() {
        this.splitOrientation = this.splitOrientation === 'vertical' ? 'horizontal' : 'vertical';
    }
}

export const appState = new AppState();
