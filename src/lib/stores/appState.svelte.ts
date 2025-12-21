export class AppState {
    activeTabId = $state<string | null>(null);
    splitView = $state(true);
    theme = $state<'dark' | 'light'>('dark');
    activeTheme = $state('default-dark');

    // Layout State
    splitPercentage = $state(0.5);
    splitOrientation = $state<'vertical' | 'horizontal'>('vertical');

    // Preferences
    tabCycling = $state<'mru' | 'sequential'>('mru');
    tabWidthMin = $state(100);
    tabWidthMax = $state(200);
    statusBarTransparency = $state(0);
    newTabPosition = $state<'beginning' | 'right' | 'end'>('end');
    startupBehavior = $state<'first' | 'last-focused' | 'new'>('last-focused');

    // Editor & Preview Settings
    editorFontFamily = $state("Consolas, 'Courier New', monospace");
    editorFontSize = $state(14);
    editorWordWrap = $state(true);
    enableAutocomplete = $state(true);
    highlightRecentChanges = $state(false);
    recentChangesMode = $state<'time' | 'count'>('time');
    recentChangesTimespan = $state(60);
    recentChangesCount = $state(10);
    previewFontFamily = $state("system-ui, -apple-system, sans-serif");
    previewFontSize = $state(16);
    gfmEnabled = $state(true);

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
    tooltipDelay = $state(1000);

    constructor() { }

    toggleSplitView() {
        this.splitView = !this.splitView;
    }

    setTheme(newTheme: 'dark' | 'light') {
        this.theme = newTheme;
        this.activeTheme = newTheme === 'dark' ? 'default-dark' : 'default-light';
    }

    toggleOrientation() {
        this.splitOrientation = this.splitOrientation === 'vertical' ? 'horizontal' : 'vertical';
    }
}

export const appState = new AppState();
