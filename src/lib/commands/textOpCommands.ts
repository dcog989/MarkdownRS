import { OPERATION_CATEGORIES, TEXT_OPERATIONS_REGISTRY } from '$lib/config/textOperationsRegistry';
import { performTextTransform } from '$lib/stores/editorStore.svelte';
import type { Command } from './types';

const CATEGORY_TITLE_MAP = Object.fromEntries(OPERATION_CATEGORIES.map((c) => [c.id, c.title]));

export const textOpCommands: Command[] = Object.values(TEXT_OPERATIONS_REGISTRY).map((op) => {
  const categoryTitle = CATEGORY_TITLE_MAP[op.category] || op.category;
  const cmd: Command = {
    id: `textop.${op.id}`,
    label: `${categoryTitle === 'Text' ? 'Editor' : categoryTitle}: ${op.label}`,
    category: categoryTitle === 'Text' ? 'Editor' : categoryTitle,
    handler: () => performTextTransform(op.id),
  };
  if (op.defaultKey) {
    cmd.defaultKey = op.defaultKey;
  }
  return cmd;
});
