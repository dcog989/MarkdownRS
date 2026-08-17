<script lang="ts">
import { type Command, commands } from '$lib/commands/commands';
import AboutModal from '$lib/components/ui/AboutModal.svelte';
import BookmarksModal from '$lib/components/ui/BookmarksModal.svelte';
import CommandPalette from '$lib/components/ui/CommandPalette.svelte';
import DataModal from '$lib/components/ui/DataModal.svelte';
import EmojiPicker from '$lib/components/ui/EmojiPicker.svelte';
import FileHistoryModal from '$lib/components/ui/FileHistoryModal.svelte';
import PromptModal from '$lib/components/ui/PromptModal.svelte';
import RumdlConfigModal from '$lib/components/ui/RumdlConfigModal.svelte';
import SettingsModal from '$lib/components/ui/SettingsModal.svelte';
import ShortcutsModal from '$lib/components/ui/ShortcutsModal.svelte';
import { settingsState } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { sortCommands } from '$lib/utils/commandPaletteSort';
import { openFileByPath } from '$lib/utils/fileSystem';

const basePaletteCommands: Command[] = commands.filter((c) => c.showInPalette !== false);

const paletteCommands = $derived(
  sortCommands(
    basePaletteCommands,
    settingsState.commandPaletteSort,
    settingsState.commandUsage,
    settingsState.commandUsageCounts,
  ),
);
</script>

<CommandPalette
  bind:isOpen={appContext.interface.showCommandPalette}
  commands={paletteCommands}
  onClose={() => (appContext.interface.showCommandPalette = false)}
/>
<FileHistoryModal
  bind:isOpen={appContext.interface.showFileHistory}
  onClose={() => (appContext.interface.showFileHistory = false)}
/>
<SettingsModal
  bind:isOpen={appContext.interface.showSettings}
  onClose={() => (appContext.interface.showSettings = false)}
/>
<AboutModal
  bind:isOpen={appContext.interface.showAbout}
  position="top"
  onClose={() => (appContext.interface.showAbout = false)}
/>
<BookmarksModal
  bind:isOpen={appContext.interface.showBookmarks}
  position="top"
  onClose={() => (appContext.interface.showBookmarks = false)}
  onOpenFile={(path) => openFileByPath(path)}
/>
<ShortcutsModal
  bind:isOpen={appContext.interface.showShortcuts}
  onClose={() => (appContext.interface.showShortcuts = false)}
/>

<DataModal bind:isOpen={appContext.interface.showData} onClose={() => (appContext.interface.showData = false)} />
<RumdlConfigModal
  bind:isOpen={appContext.interface.showRumdlConfig}
  onClose={() => (appContext.interface.showRumdlConfig = false)}
/>
<EmojiPicker
  bind:isOpen={appContext.interface.showEmojiPicker}
  onClose={() => (appContext.interface.showEmojiPicker = false)}
/>
<PromptModal />
