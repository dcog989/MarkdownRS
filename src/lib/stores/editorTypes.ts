export type EditorTab = {
  id: string;
  title: string;
  content: string;
  lastSavedHash: string;
  isDirty: boolean;
  path: string | null;
  sizeBytes: number;
  wordCount: number;
  lineCount: number;
  widestColumn: number;
  cursor: { anchor: number; head: number };
  created?: string;
  modified?: string;
  formattedTimestamp?: string;
  originalTitle?: string;
  isPinned?: boolean;
  customTitle?: string;
  lineEnding: 'LF' | 'CRLF';
  encoding: string;
  hasBom: boolean;
  fileCheckFailed?: boolean;
  preferredExtension?: 'md' | 'txt';
  contentLoaded?: boolean;
  wordCountPending?: boolean;
  forceSync?: number;
};

export type TabTransientState = {
  scrollPercentage: number;
  scrollTop: number;
  topLine: number;
  previewScrollTop: number;
  contentChanged: boolean;
  isPersisted: boolean;
  fileCheckPerformed: boolean;
  forceFullFeatures: boolean;
};

export type ClosedTab = {
  tab: EditorTab;
  index: number;
  historyState?: unknown;
};
