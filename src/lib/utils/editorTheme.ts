import { EditorView } from "@codemirror/view";

// The app's base UI font stack (mirrors app.css) and the .text-ui size, used
// for in-editor tooltips so they don't render in the editor's monospace font.
const UI_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Droid Sans", sans-serif';
const UI_FONT_SIZE = "0.8125rem";

const MIN_FONT_SIZE_PX = 8;
const MAX_FONT_SIZE_PX = 32;
const DEFAULT_FONT_SIZE_PX = 14;

// Bounds match the editorFontSize setting. A hand-edited settings file can hold
// 0 or NaN here, which makes the document invisible with no obvious way back.
function clampFontSize(fontSize: number): number {
  if (!Number.isFinite(fontSize)) return DEFAULT_FONT_SIZE_PX;
  return Math.min(MAX_FONT_SIZE_PX, Math.max(MIN_FONT_SIZE_PX, fontSize));
}

export function generateDynamicTheme(fontSize: number, fontFamily: string) {
  const fontSizePx = clampFontSize(fontSize);
  return EditorView.theme({
    "&": { height: "100%", fontSize: `${fontSizePx}px` },
    ".cm-cursor": {
      borderLeftColor: "var(--editor-fg)",
      borderLeftWidth: "2px",
    },
    ".cm-scroller": { fontFamily, overflow: "auto", overflowAnchor: "none" },
    ".cm-content": { fontFamily },
    ".cm-scroller::-webkit-scrollbar": { width: "0", height: "8px" },
    ".cm-scroller::-webkit-scrollbar-track": { background: "transparent" },
    ".cm-scroller::-webkit-scrollbar-thumb": { background: "var(--scrollbar-thumb)", borderRadius: "4px" },
    ".cm-scroller::-webkit-scrollbar-thumb:hover": { background: "var(--scrollbar-thumb-hover)" },
    // position:relative overrides CM6's inline position:sticky on .cm-gutters.
    // Sticky creates a compositor layer that freezes during heavy main-thread frames.
    // Relative keeps the gutter in the normal flow so it repaints every frame.
    ".cm-gutters": { border: "none", backgroundColor: "transparent", position: "relative !important" },
    ".cm-gutterElement": { alignItems: "flex-start !important" },
    "& .cm-selectionLayer .cm-selectionBackground": {
      background: "var(--editor-selection-bg) !important",
    },
    ".cm-content ::selection": {
      backgroundColor: "var(--editor-selection-bg) !important",
    },
    ".cm-selectionMatch": { backgroundColor: "var(--editor-selection-match-bg)" },
    ".cm-searchMatch": {
      backgroundColor: "oklch(0.59 0.14 336)",
      color: "#0b0b0b !important",
      borderRadius: "2px",
    },
    ".cm-searchMatch *": {
      color: "#0b0b0b !important",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "oklch(0.68382 0.13417 149.00934) !important",
      color: "#0b0b0b !important",
      zIndex: "10",
      position: "relative",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--editor-surface-2)",
      border: "1px solid var(--editor-border-secondary)",
      color: "var(--editor-fg)",
      borderRadius: "6px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete": {
      borderRadius: "6px",
      overflow: "hidden",
      border: "1px solid var(--editor-border-secondary)",
      backgroundColor: "var(--editor-surface-2)",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "4px 8px" },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--editor-tooltip-accent) !important",
      color: "var(--editor-tooltip-accent-fg) !important",
    },
    ".cm-tooltip.cm-tooltip-lint": {
      backgroundColor: "var(--editor-surface-2)",
      border: "1px solid var(--editor-border-secondary)",
      color: "var(--editor-fg)",
      fontFamily: UI_FONT_FAMILY,
      fontSize: UI_FONT_SIZE,
      lineHeight: "1.4",
      overflowY: "auto",
    },
  });
}
