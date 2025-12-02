<script lang="ts">
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { EditorState } from "@codemirror/state";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
    import { onDestroy, onMount, untrack } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorContainer: HTMLDivElement;
    let view: EditorView;
    let timer: number;

    // React to active tab changes to restore content/state, but ignore internal updates
    $effect(() => {
        const currentTab = editorStore.tabs.find((t) => t.id === tabId);
        if (currentTab) {
            untrack(() => {
                if (view && view.state.doc.toString() !== currentTab.content) {
                    view.dispatch({
                        changes: {
                            from: 0,
                            to: view.state.doc.length,
                            insert: currentTab.content,
                        },
                    });
                }
            });
        }
    });

    onMount(() => {
        const currentTab = editorStore.tabs.find((t) => t.id === tabId);
        const initialContent = currentTab?.content || "";

        const updateListener = EditorView.updateListener.of((update) => {
            // Debounce store updates to prevent UI blocking during rapid typing
            if (update.docChanged || update.view.scrollDOM) {
                clearTimeout(timer);
                timer = window.setTimeout(() => {
                    if (update.docChanged) {
                        editorStore.updateContent(tabId, update.state.doc.toString());
                    }
                    if (update.view.scrollDOM) {
                        const scrollElement = update.view.scrollDOM;
                        const percentage = scrollElement.scrollTop / (scrollElement.scrollHeight - scrollElement.clientHeight);
                        if (!isNaN(percentage)) {
                            editorStore.updateScroll(tabId, percentage);
                        }
                    }
                }, 100);
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
                oneDark,
                EditorView.lineWrapping,
                updateListener,
                EditorView.theme({
                    "&": { height: "100%", fontSize: "14px" },
                    ".cm-scroller": { fontFamily: "monospace", overflow: "auto" },
                }),
            ],
        });

        view = new EditorView({
            state,
            parent: editorContainer,
        });
    });

    onDestroy(() => {
        if (view) view.destroy();
        clearTimeout(timer);
    });
</script>

<div class="w-full h-full overflow-hidden" bind:this={editorContainer}></div>
