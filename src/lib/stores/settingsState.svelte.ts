export const settingsState = $state({
  splitView: true,
  locale: 'en',
  theme: 'dark' as 'dark' | 'light',
  activeTheme: 'System',
  availableThemes: ['System'] as string[],
  customAccentColor: '',
  splitPercentage: 0.5,
  splitOrientation: 'vertical' as 'vertical' | 'horizontal',
  tabCycling: 'mru' as 'mru' | 'sequential',
  tabWidthMin: 120,
  tabWidthMax: 240,
  statusBarTransparency: 0,
  newTabPosition: 'end' as 'beginning' | 'right' | 'end',
  startupBehavior: 'last-focused' as 'first' | 'last-focused' | 'new',
  editorFontFamily: 'monospace',
  editorFontSize: 14,
  wrapGuideColumn: 0,
  showWhitespace: false,
  autocompleteDelay: 850,
  recentChangesTimespan: 600,
  recentChangesCount: 16,
  undoDepth: 100,
  previewFontFamily: 'system-ui, -apple-system, sans-serif',
  previewFontSize: 16,

  markdownFlavor: 'gfm' as 'commonmark' | 'gfm',
  logLevel: 'info' as 'trace' | 'debug' | 'info' | 'warn' | 'error',
  formatOnSave: false,
  defaultIndent: 2,
  lineEndingPreference: 'system' as 'system' | 'LF' | 'CRLF',
  tooltipDelay: 1250,
  findPanelTransparent: false,
  findPanelCloseOnBlur: false,
  languageDictionaries: ['en-US'] as string[],
  technicalDictionaries: false,
  scienceDictionaries: false,
  tabNameFromContent: false,
  showMinimap: false,
  writerWrapLength: 100,
  collapsePinnedTabs: false,
  enableClosedTabHistory: true,
  customShortcuts: {} as Record<string, string>,
  confirmationSuppressed: false,
  newFileTemplatePath: '',
  maxFileSizeMB: 50,
  fileHistoryLimit: 999,
  autoSaveInterval: -1,
  viewMode: 'rendered' as 'raw' | 'rendered',
  fileTreeVisible: true,
  fileTreeWidth: 240,
  fileTreeShowHidden: false,
  fileTreeShowMarkdownOnly: false,
  fileTreeLocked: false,
  fileTreeLockedRoot: '',
  commandPaletteSort: 'alphabetical' as 'alphabetical' | 'recent' | 'most-used',
  commandUsage: {} as Record<string, number>,
  commandUsageCounts: {} as Record<string, number>,
});

export function toggleSplitView() {
  settingsState.splitView = !settingsState.splitView;
}

export function setTheme(newTheme: 'dark' | 'light') {
  settingsState.activeTheme = 'System';
  settingsState.theme = newTheme;
}

export function syncThemeFromSystem() {
  settingsState.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function toggleOrientation() {
  settingsState.splitOrientation = settingsState.splitOrientation === 'vertical' ? 'horizontal' : 'vertical';
}

export function toggleViewMode() {
  settingsState.viewMode = settingsState.viewMode === 'raw' ? 'rendered' : 'raw';
}

export function toggleFileTree() {
  settingsState.fileTreeVisible = !settingsState.fileTreeVisible;
}

export function toggleFileTreeShowHidden() {
  settingsState.fileTreeShowHidden = !settingsState.fileTreeShowHidden;
}

export function toggleFileTreeShowMarkdownOnly() {
  settingsState.fileTreeShowMarkdownOnly = !settingsState.fileTreeShowMarkdownOnly;
}

export function toggleFileTreeLocked() {
  settingsState.fileTreeLocked = !settingsState.fileTreeLocked;
}
