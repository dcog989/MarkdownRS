import { toggleEmojiPicker } from "$lib/stores/interfaceStore.svelte";
import type { Command } from "./types";

export const emojiCommands: Command[] = [
  {
    id: "emoji.insert",
    label: "Emoji",
    labelKey: "command.emoji",
    category: "commandCategory.insert",
    defaultKey: "ctrl+shift+e",
    global: true,
    handler: toggleEmojiPicker,
  },
];
