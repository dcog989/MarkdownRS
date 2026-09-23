import { OPERATION_CATEGORIES, TEXT_OPERATIONS_REGISTRY } from "$lib/config/textOperationsRegistry";
import { performTextTransform } from "$lib/stores/editorStore.svelte";
import type { Command } from "./types";

const CATEGORY_IDS = new Set(OPERATION_CATEGORIES.map((c) => c.id));

export const textOpCommands: Command[] = Object.values(TEXT_OPERATIONS_REGISTRY).map((op) => {
  const categoryId = CATEGORY_IDS.has(op.category) ? op.category : "text";
  const cmd: Command = {
    id: `textop.${op.id}`,
    label: op.label,
    labelKey: `textOps.op.${op.id}`,
    category: `textOps.category.${categoryId}`,
    handler: () => performTextTransform(op.id),
  };
  if (op.defaultKey) {
    cmd.defaultKey = op.defaultKey;
  }
  return cmd;
});
