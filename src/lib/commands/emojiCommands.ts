import { toggleEmojiPicker } from '$lib/stores/interfaceStore.svelte';
import type { Command } from './types';

export const emojiCommands: Command[] = [
  {
    id: 'emoji.insert',
    label: 'Insert: Emoji',
    category: 'Insert',
    defaultKey: 'ctrl+shift+e',
    global: true,
    handler: toggleEmojiPicker,
  },
];
