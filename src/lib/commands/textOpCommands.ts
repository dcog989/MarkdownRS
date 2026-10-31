import { OPERATION_CATEGORIES, TEXT_OPERATIONS_REGISTRY } from "$lib/config/textOperationsRegistry";
import type { MessageKey } from "$lib/i18n";
import { performTextTransform } from "$lib/stores/editorStore.svelte";
import type { Command } from "./types";

const CATEGORY_IDS = new Set(OPERATION_CATEGORIES.map((c) => c.id));

export const textOpCommands: Command[] = Object.values(TEXT_OPERATIONS_REGISTRY).map((op) => {
  const categoryId = CATEGORY_IDS.has(op.category) ? op.category : "text";
  const cmd: Command = {
    id: `textop.${op.id}`,
    labelKey: `textOps.op.${op.id}` as MessageKey,
    category: `textOps.category.${categoryId}` as MessageKey,
    handler: () => performTextTransform(op.id),
  };
  if (op.defaultKey) {
    cmd.defaultKey = op.defaultKey;
  }
  return cmd;
});
