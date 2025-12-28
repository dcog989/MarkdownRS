export class AppState {
    activeTabId = $state<string | null>(null);
    splitView = $state(true);
    theme = $state<'dark' | 'light'>('dark');
    activeTheme = $state('default-dark');
    availableThemes = $state<string[]>(['default-dark', 'default-light']);

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
    editorFontFamily = $state("ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace");
    editorFontSize = $state(14);
    editorWordWrap = $state(true);
    showWhitespace = $state(false);
    enableAutocomplete = $state(true);
    autocompleteDelay = $state(250);
    recentChangesTimespan = $state(60);
    recentChangesCount = $state(10);
    undoDepth = $state(200);
    previewFontFamily = $state("system-ui, -apple-system, sans-serif");
    previewFontSize = $state(16);
    gfmEnabled = $state(true);
    markdownFlavor = $state<'commonmark' | 'gfm'>('gfm');

    // Advanced Settings
    logLevel = $state<'trace' | 'debug' | 'info' | 'warn' | 'error'>('info');

    // Formatter & Indentation Settings
    formatOnSave = $state(false);
    formatOnPaste = $state(false);
    defaultIndent = $state(2);
    formatterBulletChar = $state<'-' | '*' | '+'>('-');
    formatterCodeFence = $state<'```' | '~~~'>('```');
    formatterTableAlignment = $state(true);

    // Line Ending Preference
    lineEndingPreference = $state<'system' | 'LF' | 'CRLF'>('system');

    // Tooltip Settings
    tooltipDelay = $state(1000);

    // Find/Replace Settings
    findPanelTransparent = $state(false);
    findPanelCloseOnBlur = $state(false);

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
