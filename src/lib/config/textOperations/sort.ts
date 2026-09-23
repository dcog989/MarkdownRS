import { ArrowDown01, ArrowDown10, ArrowDownAZ, ArrowDownZA, FunnelX } from "lucide-svelte";
import type { TextOperation } from "./types";

/**
 * Sort & Order operation IDs
 */
export type SortOperationId =
  | "sort-asc"
  | "sort-case-sensitive-asc"
  | "sort-numeric-asc"
  | "sort-length-asc"
  | "sort-desc"
  | "sort-case-sensitive-desc"
  | "sort-numeric-desc"
  | "sort-length-desc"
  | "reverse"
  | "shuffle";

/**
 * Sort & Order operations
 */
export const SORT_OPERATIONS: Record<SortOperationId, TextOperation<SortOperationId>> = {
  "sort-asc": {
    id: "sort-asc",
    label: "Ascending",
    description: "Sort lines ascending, case-insensitive",
    icon: ArrowDownAZ,
    category: "sort",
    execution: "client",
  },
  "sort-case-sensitive-asc": {
    id: "sort-case-sensitive-asc",
    label: "Ascending (Case Sensitive)",
    description: "Sort lines ascending, case-sensitive",
    icon: ArrowDownAZ,
    category: "sort",
    execution: "client",
  },
  "sort-numeric-asc": {
    id: "sort-numeric-asc",
    label: "Ascending (Numeric)",
    description: "Sort lines ascending, numerically",
    icon: ArrowDown01,
    category: "sort",
    execution: "client",
  },
  "sort-length-asc": {
    id: "sort-length-asc",
    label: "Ascending (By Length)",
    description: "Sort lines ascending, by length",
    icon: ArrowDownAZ,
    category: "sort",
    execution: "client",
  },
  "sort-desc": {
    id: "sort-desc",
    label: "Descending",
    description: "Sort lines descending, case-insensitive",
    icon: ArrowDownZA,
    category: "sort",
    execution: "client",
  },
  "sort-case-sensitive-desc": {
    id: "sort-case-sensitive-desc",
    label: "Descending (Case Sensitive)",
    description: "Sort lines descending, case-sensitive",
    icon: ArrowDownZA,
    category: "sort",
    execution: "client",
  },
  "sort-numeric-desc": {
    id: "sort-numeric-desc",
    label: "Descending (Numeric)",
    description: "Sort lines descending, numerically",
    icon: ArrowDown10,
    category: "sort",
    execution: "client",
  },
  "sort-length-desc": {
    id: "sort-length-desc",
    label: "Descending (By Length)",
    description: "Sort lines descending, by length",
    icon: ArrowDownZA,
    category: "sort",
    execution: "client",
  },
  reverse: {
    id: "reverse",
    label: "Reverse",
    description: "Reverse the order of all lines",
    icon: ArrowDownZA,
    category: "sort",
    execution: "client",
  },
  shuffle: {
    id: "shuffle",
    label: "Shuffle",
    description: "Randomly shuffle line order",
    icon: FunnelX,
    category: "sort",
    execution: "client",
  },
};
