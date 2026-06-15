export const appState = $state({
  activeTabId: null as string | null,
  isTabSwitching: false,
  writerMode: false,
  osPlatform: 'windows' as 'windows' | 'linux' | 'macos',
});

export function toggleWriterMode() {
  appState.writerMode = !appState.writerMode;
}
