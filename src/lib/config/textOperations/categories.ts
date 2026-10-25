import ArrowDownAZ from "lucide-svelte/icons/arrow-down-a-z";
import CaseSensitive from "lucide-svelte/icons/case-sensitive";
import Hash from "lucide-svelte/icons/hash";
import Trash2 from "lucide-svelte/icons/trash-2";
import Type from "lucide-svelte/icons/type";
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
