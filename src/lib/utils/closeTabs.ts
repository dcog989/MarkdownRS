export type CloseManyMode = "right" | "left" | "others" | "saved" | "unsaved" | "all" | "unpinned";

/** The fields the close modes read; keeps the selector usable without a full tab. */
export type CloseCandidate = { id: string; isDirty: boolean; isPinned?: boolean };

/**
 * Which tabs a close-many mode targets. Pinned tabs survive every mode except
 * "all" (the forced close). "right"/"left" are relative to `tabId` and target
 * nothing without it: the -1 fallback index would otherwise close the wrong
 * tabs through slice(0) or slice(0, -1).
 */
export function selectTabsToClose<T extends CloseCandidate>(tabs: T[], mode: CloseManyMode, tabId?: string): T[] {
  const tabIndex = tabId != null ? tabs.findIndex((t) => t.id === tabId) : -1;
  const closeable = (list: T[]) => (mode === "all" ? list : list.filter((t) => !t.isPinned));

  switch (mode) {
    case "right":
      if (tabIndex === -1) return [];
      return closeable(tabs.slice(tabIndex + 1));
    case "left":
      if (tabIndex === -1) return [];
      return closeable(tabs.slice(0, tabIndex));
    case "others":
      return closeable(tabs.filter((t) => t.id !== tabId));
    case "saved":
      return closeable(
        tabId != null ? tabs.filter((t) => !t.isDirty && t.id !== tabId) : tabs.filter((t) => !t.isDirty),
      );
    case "unsaved":
      return closeable(tabId != null ? tabs.filter((t) => t.isDirty && t.id !== tabId) : tabs.filter((t) => t.isDirty));
    case "unpinned":
      return tabs.filter((t) => !t.isPinned);
    case "all":
      return tabs;
  }
}
