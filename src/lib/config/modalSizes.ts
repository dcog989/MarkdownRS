/**
 * Centralized modal constraints configuration
 * Modals auto-size to content within these bounds
 */

export const MODAL_CONSTRAINTS = {
  /** Minimum width for all modals */
  MIN_WIDTH: "480px",
  /** Maximum width for all modals */
  MAX_WIDTH: "720px",
  /** Fixed width for searchable modals so they don't resize while filtering */
  SEARCH_WIDTH: "min(720px, calc(100vw - 4rem))",
} as const;
