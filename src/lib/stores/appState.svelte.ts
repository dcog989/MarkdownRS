// The state object
export const appState = $state({
  activeTabId: null as string | null,
  splitView: true,
  theme: 'dark' as 'dark' | 'light',
  activeTheme: 'System',
  availableThemes: ['System', 'RS-Dark', 'RS-Light'] as string[],
  splitPercentage: 0.5,
  splitOrientation: 'vertical' as 'vertical' | 'horizontal',
  tabCycling: 'mru' as 'mru' | 'sequential',
  tabWidthMin: 100,
  tabWidthMax: 200,
  statusBarTransparency: 0,
  newTabPosition: 'end' as 'beginning' | 'right' | 'end',
  startupBehavior: 'last-focused' as 'first' | 'last-focused' | 'new',
  editorFontFamily: "'Source Code Pro', 'Cascadia Code', monospace, ui-monospace",
  editorFontSize: 14,
  editorWordWrap: true,
  showWhitespace: false,
  enableAutocomplete: true,
  autocompleteDelay: 850,
  recentChangesTimespan: 0,
  recentChangesCount: 16,
  undoDepth: 100,
  previewFontFamily: 'system-ui, -apple-system, sans-serif',
  previewFontSize: 16,
  gfmEnabled: true,
  markdownFlavor: 'gfm' as 'commonmark' | 'gfm',
  logLevel: 'info' as 'trace' | 'debug' | 'info' | 'warn' | 'error',
  formatOnSave: false,
  formatOnPaste: false,
  defaultIndent: 2,
  formatterBulletChar: '-' as '-' | '*' | '+',
  formatterEmphasisChar: '*' as '*' | '_',
  formatterCodeFence: '```' as '```' | '~~~',
  formatterTableAlignment: true,
  lineEndingPreference: 'system' as 'system' | 'LF' | 'CRLF',
  tooltipDelay: 1000,
  findPanelTransparent: false,
  findPanelCloseOnBlur: false,
  languageDictionaries: ['en-US'] as string[],
  technicalDictionaries: true,
  scienceDictionaries: false,
  tabNameFromContent: false,
  wrapGuideColumn: 0,
  doubleClickSelectsTrailingSpace: false,
  collapsePinnedTabs: false,
  customShortcuts: {} as Record<string, string>,
  confirmationSuppressed: false,
  // Tab switching flag to prevent auto-format during transitions
  isTabSwitching: false,
  maxFileSizeMB: 50,
  writerMode: false,
  osPlatform: 'windows' as 'windows' | 'linux' | 'macos',
  autoSaveEnabled: false,
  autoSaveInterval: 60,
  commandPaletteSort: 'alphabetical' as 'alphabetical' | 'recent' | 'most-used',
  commandUsage: {} as Record<string, number>,
  commandUsageCounts: {} as Record<string, number>,
  minimapEnabled: false,
  minimapWidth: 50,
});

// Logic functions
export function toggleSplitView() {
  appState.splitView = !appState.splitView;
}

export function setTheme(newTheme: 'dark' | 'light') {
  appState.theme = newTheme;
  appState.activeTheme = newTheme === 'dark' ? 'RS-Dark' : 'RS-Light';
}

export function syncThemeFromActiveTheme() {
  if (appState.activeTheme === 'System') {
    if (typeof window !== 'undefined') {
      appState.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return;
  }
  appState.theme = appState.activeTheme.toLowerCase().includes('light') ? 'light' : 'dark';
}

export function toggleOrientation() {
  appState.splitOrientation = appState.splitOrientation === 'vertical' ? 'horizontal' : 'vertical';
}

export function toggleWriterMode() {
  appState.writerMode = !appState.writerMode;
}
