import { toggleRumdlConfig } from '$lib/stores/interfaceStore.svelte';
import type { Command } from './types';

export const markdownCommands: Command[] = [
  {
    id: 'markdown.editRumdlConfig',
    label: 'Markdown: Edit rumdl Config',
    category: 'Markdown',
    handler: toggleRumdlConfig,
  },
];
