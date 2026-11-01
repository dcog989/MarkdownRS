import { BUILTIN_THEME_NAME, themeSupportsLight } from "$lib/utils/themes";

// Shared with the settings definitions so the shown default cannot drift from
// the value the app actually starts with.
export const DEFAULT_TAB_WIDTH_MIN = 120;
export const DEFAULT_TAB_WIDTH_MAX = 240;

/** Follow the OS appearance, or force one. Applies to every theme. */
export type ThemeMode = "auto" | "dark" | "light";

export const settingsState = $state({
  splitView: true,
  locale: "system",
  theme: "dark" as "dark" | "light",
  themeMode: "auto" as ThemeMode,
  activeTheme: BUILTIN_THEME_NAME,
  availableThemes: [BUILTIN_THEME_NAME] as string[],
  /** Theme file stem → whether that theme has a light palette. Filled when the
   *  settings modal loads the theme list. */
  themeVariants: {} as Record<string, boolean>,
  customAccentColor: "",
  /** Desktop accent colour as `#rrggbb`, read at startup. Empty when the OS
   *  exposes none. Runtime only, never persisted. */
  systemAccentColor: "",
  splitPercentage: 0.5,
  paneSplitPercentage: 0.5,
  splitOrientation: "vertical" as "vertical" | "horizontal",
  tabCycling: "mru" as "mru" | "sequential",
  tabWidthMin: DEFAULT_TAB_WIDTH_MIN,
  tabWidthMax: DEFAULT_TAB_WIDTH_MAX,
  statusBarOpacity: 100,
  newTabPosition: "end" as "beginning" | "right" | "end",
  startupBehavior: "last-focused" as "first" | "last-focused" | "new",
  editorFontFamily: "monospace",
  editorFontSize: 14,
  wrapGuideColumn: 0,
  showWhitespace: false,
  enableFolding: true,
  colorSwatches: false,
  autocompleteDelay: 850,
  recentChangesTimespan: 600,
  recentChangesCount: 16,
  undoDepth: 100,
  previewFontFamily: "sans-serif",
  previewFontSize: 16,

  markdownFlavor: "gfm" as "commonmark" | "gfm",
  harperEnabled: false,
  harperLinters: {} as Record<string, boolean>,
  logLevel: "info" as "trace" | "debug" | "info" | "warn" | "error" | "off",
  formatOnSave: false,
  defaultIndent: 2,
  lineEndingPreference: "system" as "system" | "LF" | "CRLF",
  tooltipDelay: 1250,
  findPanelOpacity: 100,
  findPanelCloseOnBlur: false,
  languageDictionaries: ["en-US"] as string[],
  technicalDictionaries: false,
  scienceDictionaries: false,
  tabNameFromContent: false,
  showMinimap: false,
  writerWrapLength: 100,
  collapsePinnedTabs: false,
  enableClosedTabHistory: true,
  customShortcuts: {} as Record<string, string>,
  confirmationSuppressed: false,
  newFileTemplatePath: "",
  maxFileSizeMB: 20,
  fileHistoryLimit: 999,
  autoSaveInterval: -1,
  viewMode: "rendered" as "raw" | "rendered",
  fileTreeVisible: true,
  fileTreeWidth: 240,
  fileTreeShowHidden: false,
  fileTreeShowMarkdownOnly: false,
  fileTreeLocked: false,
  fileTreeLockedRoot: "",
  commandPaletteSort: "categories" as "alphabetical" | "recent" | "most-used" | "categories",
  // Direction is per sort mode: alphabetical/categories read naturally ascending,
  // while recent/most-used read naturally descending (newest/most-used first).
  commandPaletteSortDirections: {
    alphabetical: "asc",
    categories: "asc",
    recent: "desc",
    "most-used": "desc",
  } as Record<"alphabetical" | "recent" | "most-used" | "categories", "asc" | "desc">,
  commandUsage: {} as Record<string, number>,
  commandUsageCounts: {} as Record<string, number>,
});

export function recordCommandUsage(commandId: string): void {
  settingsState.commandUsage[commandId] = Date.now();
  settingsState.commandUsageCounts[commandId] = (settingsState.commandUsageCounts[commandId] ?? 0) + 1;
}

export function toggleSplitView() {
  settingsState.splitView = !settingsState.splitView;
}

export function setTheme(mode: ThemeMode) {
  // A dark-only theme has no light palette, so asking for light falls back to
  // the built-in one instead of leaving a dark palette under light chrome.
  if (mode === "light" && themeSupportsLight(settingsState.activeTheme, settingsState.themeVariants) === false) {
    settingsState.activeTheme = BUILTIN_THEME_NAME;
  }
  settingsState.themeMode = mode;
  syncThemeFromSystem();
}

export function syncThemeFromSystem() {
  if (settingsState.themeMode !== "auto") {
    settingsState.theme = settingsState.themeMode;
    return;
  }
  settingsState.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function toggleOrientation() {
  settingsState.splitOrientation = settingsState.splitOrientation === "vertical" ? "horizontal" : "vertical";
}

export function toggleViewMode() {
  settingsState.viewMode = settingsState.viewMode === "raw" ? "rendered" : "raw";
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
