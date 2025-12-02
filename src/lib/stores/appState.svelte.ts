export class AppState {
    activeTabId = $state<string | null>(null);
    splitView = $state(true);
    theme = $state<'dark' | 'light'>('dark');

    constructor() {
        // Initialization logic can go here
    }

    toggleSplitView() {
        this.splitView = !this.splitView;
    }

    setTheme(newTheme: 'dark' | 'light') {
        this.theme = newTheme;
    }
}

export const appState = new AppState();
