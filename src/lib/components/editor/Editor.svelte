<script lang="ts">
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { EditorState } from "@codemirror/state";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
    import { onDestroy, onMount } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorContainer: HTMLDivElement;
    let view: EditorView;

    // React to active tab changes to restore content/state
    $effect(() => {
        const currentTab = editorStore.tabs.find((t) => t.id === tabId);
        if (view && currentTab && view.state.doc.toString() !== currentTab.content) {
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: currentTab.content,
                },
            });
        }
    });

    onMount(() => {
        const currentTab = editorStore.tabs.find((t) => t.id === tabId);
        const initialContent = currentTab?.content || "";

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                editorStore.updateContent(tabId, update.state.doc.toString());
            }
            if (update.view.scrollDOM) {
                // Calculate scroll percentage for sync
                const scrollElement = update.view.scrollDOM;
                const percentage = scrollElement.scrollTop / (scrollElement.scrollHeight - scrollElement.clientHeight);
                // Only update if number is valid (avoid NaN on init)
                if (!isNaN(percentage)) {
                    editorStore.updateScroll(tabId, percentage);
                }
            }
        });

        const state = EditorState.create({
            doc: initialContent,
            extensions: [
                lineNumbers(),
                highlightActiveLineGutter(),
                history(),
                keymap.of([...defaultKeymap, ...historyKeymap]),
                markdown({ base: markdownLanguage, codeLanguages: languages }),
                oneDark, // Default to dark mode for v1
                EditorView.lineWrapping,
                updateListener,
                EditorView.theme({
                    "&": { height: "100%", fontSize: "14px" },
                    ".cm-scroller": { fontFamily: "monospace" },
                }),
            ],
        });

        view = new EditorView({
            state,
            parent: editorContainer,
        });
    });

    onDestroy(() => {
        if (view) {
            view.destroy();
        }
    });
</script>

<div class="w-full h-full overflow-hidden" bind:this={editorContainer}></div>
