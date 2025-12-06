<script lang="ts">
    import { addToDictionary } from "$lib/utils/fileSystem";
    import { message } from "@tauri-apps/plugin-dialog";
    import { BookPlus, ClipboardCopy, ClipboardPaste, Scissors } from "lucide-svelte";

    let { 
        x = 0, 
        y = 0, 
        selectedText = "",
        wordUnderCursor = "",
        onClose 
    } = $props<{ 
        x: number; 
        y: number; 
        selectedText?: string;
        wordUnderCursor?: string;
        onClose: () => void;
    }>();

    async function handleAddToDictionary() {
        const word = selectedText?.trim() || wordUnderCursor?.trim();
        if (word && word.length > 0) {
            await addToDictionary(word);
            await message(`Added "${word}" to dictionary.`, { kind: "info" });
        }
        onClose();
    }

    function handleCut() {
        document.execCommand('cut');
        onClose();
    }

    function handleCopy() {
        document.execCommand('copy');
        onClose();
    }

    function handlePaste() {
        document.execCommand('paste');
        onClose();
    }

    const hasWord = $derived((selectedText?.trim() || wordUnderCursor?.trim())?.length > 0);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50" onclick={onClose}>
    <div 
        class="absolute min-w-[200px] rounded-md shadow-xl border py-1"
        style="
            left: {x}px; 
            top: {y}px; 
            background-color: var(--bg-panel); 
            border-color: var(--border-light);
        "
        onclick={(e) => e.stopPropagation()}
    >
        {#if selectedText}
            <button
                type="button"
                class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10"
                style="color: var(--fg-default);"
                onclick={handleCut}
            >
                <Scissors size={14} />
                <span>Cut</span>
                <span class="ml-auto text-xs opacity-60">Ctrl+X</span>
            </button>
        {/if}
        
        {#if selectedText}
            <button
                type="button"
                class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10"
                style="color: var(--fg-default);"
                onclick={handleCopy}
            >
                <ClipboardCopy size={14} />
                <span>Copy</span>
                <span class="ml-auto text-xs opacity-60">Ctrl+C</span>
            </button>
        {/if}

        <button
            type="button"
            class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10"
            style="color: var(--fg-default);"
            onclick={handlePaste}
        >
            <ClipboardPaste size={14} />
            <span>Paste</span>
            <span class="ml-auto text-xs opacity-60">Ctrl+V</span>
        </button>

        {#if hasWord}
            <div class="h-px my-1" style="background-color: var(--border-main);"></div>
            
            <button
                type="button"
                class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10"
                style="color: var(--fg-default);"
                onclick={handleAddToDictionary}
            >
                <BookPlus size={14} />
                <span>Add to Dictionary</span>
                <span class="ml-auto text-xs opacity-60">F8</span>
            </button>
        {/if}
    </div>
</div>
