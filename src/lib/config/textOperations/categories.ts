import { ArrowDownAZ, CaseSensitive, Hash, Trash2, Type } from "lucide-svelte";
import type { OperationCategory } from "./types";

/**
 * All operation categories
 */
export const OPERATION_CATEGORIES: OperationCategory[] = [
  { id: "sort", title: "Sort", icon: ArrowDownAZ },
  { id: "filter", title: "Remove", icon: Trash2 },
  { id: "case", title: "Case", icon: CaseSensitive },
  { id: "markdown", title: "Markdown", icon: Hash },
  { id: "text", title: "Text", icon: Type },
];
