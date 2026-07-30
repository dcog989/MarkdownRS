export const settingsState = $state({
  splitView: true,
  theme: 'dark' as 'dark' | 'light',
  activeTheme: 'System',
  availableThemes: ['System', 'RS-Dark', 'RS-Light'] as string[],
  splitPercentage: 0.5,
  splitOrientation: 'vertical' as 'vertical' | 'horizontal',
  tabCycling: 'mru' as 'mru' | 'sequential',
  tabWidthMin: 120,
  tabWidthMax: 240,
  statusBarTransparency: 0,
  newTabPosition: 'end' as 'beginning' | 'right' | 'end',
  startupBehavior: 'last-focused' as 'first' | 'last-focused' | 'new',
  editorFontFamily: "'Source Code Pro', 'Cascadia Code', monospace, ui-monospace",
  editorFontSize: 14,
  editorWordWrap: true,
  showWhitespace: false,
  enableAutocomplete: true,
  autocompleteDelay: 850,
  recentChangesTimespan: 600,
  recentChangesCount: 16,
  undoDepth: 100,
  previewFontFamily: 'system-ui, -apple-system, sans-serif',
  previewFontSize: 16,

  markdownFlavor: 'gfm' as 'commonmark' | 'gfm',
  logLevel: 'info' as 'trace' | 'debug' | 'info' | 'warn' | 'error',
  formatOnSave: false,
  formatOnPaste: false,
  defaultIndent: 2,
  formatterBulletChar: '-' as '-' | '*' | '+',
  formatterEmphasisChar: '*' as '*' | '_',
  formatterCodeFence: '```' as '```' | '~~~',
  lineEndingPreference: 'system' as 'system' | 'LF' | 'CRLF',
  tooltipDelay: 1250,
  findPanelTransparent: false,
  findPanelCloseOnBlur: false,
  languageDictionaries: ['en-US'] as string[],
  technicalDictionaries: false,
  scienceDictionaries: false,
  tabNameFromContent: false,
  wrapGuideColumn: 0,
  showMinimap: false,
  writerWrapLength: 100,
  collapsePinnedTabs: false,
  enableClosedTabHistory: true,
  customShortcuts: {} as Record<string, string>,
  confirmationSuppressed: false,
  maxFileSizeMB: 50,
  recentFilesLimit: 99,
  autoSaveEnabled: false,
  autoSaveInterval: 60,
  viewMode: 'rendered' as 'raw' | 'rendered',
  commandPaletteSort: 'alphabetical' as 'alphabetical' | 'recent' | 'most-used',
  commandUsage: {} as Record<string, number>,
  commandUsageCounts: {} as Record<string, number>,
});

export function toggleSplitView() {
  settingsState.splitView = !settingsState.splitView;
}

export function setTheme(newTheme: 'dark' | 'light') {
  settingsState.theme = newTheme;
  settingsState.activeTheme = newTheme === 'dark' ? 'RS-Dark' : 'RS-Light';
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
