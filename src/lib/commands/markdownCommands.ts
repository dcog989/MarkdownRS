import { toggleRumdlConfig } from "$lib/stores/interfaceStore.svelte";
import type { Command } from "./types";

export const markdownCommands: Command[] = [
  {
    id: "markdown.editRumdlConfig",
    label: "Edit rumdl Config",
    labelKey: "command.editRumdlConfig",
    category: "commandCategory.markdown",
    handler: toggleRumdlConfig,
  },
];
