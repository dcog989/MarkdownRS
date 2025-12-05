export class AppState {
    activeTabId = $state<string | null>(null);
    splitView = $state(true);
    theme = $state<'dark' | 'light'>('dark');

    // Layout State
    splitPercentage = $state(0.5);
    splitOrientation = $state<'vertical' | 'horizontal'>('vertical');

    // Preferences
    tabCycling = $state<'mru' | 'sequential'>('sequential');
    tabWidthMin = $state(100);
    tabWidthMax = $state(200);
    statusBarTransparent = $state(false);
    newTabPosition = $state<'right' | 'end'>('end');

    // Editor & Preview Settings
    editorFontFamily = $state("Consolas, 'Courier New', monospace");
    editorFontSize = $state(14);
    previewFontFamily = $state("system-ui, -apple-system, sans-serif");
    previewFontSize = $state(16);
    
    // Advanced Settings
    logLevel = $state<'trace' | 'debug' | 'info' | 'warn' | 'error'>('info');

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
