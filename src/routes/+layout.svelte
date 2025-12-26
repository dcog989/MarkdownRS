<script lang="ts">
    import ConfirmationModal from "$lib/components/ui/ConfirmationModal.svelte";
    import GlobalTooltip from "$lib/components/ui/GlobalTooltip.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { shortcutManager } from "$lib/utils/shortcuts";
    import { getThemeCss } from "$lib/utils/themes";
    import { onMount } from "svelte";
    import "../app.css";

    let { children } = $props();

    $effect(() => {
        const theme = appState.theme;
        const root = document.documentElement;
        root.setAttribute("data-theme", theme);
        root.style.colorScheme = theme;
    });

    $effect(() => {
        const themeName = appState.activeTheme;
        if (!themeName) return;

        async function loadTheme() {
            const css = await getThemeCss(themeName);
            if (!css) return;

            let styleTag = document.getElementById("user-theme-styles") as HTMLStyleElement;
            if (!styleTag) {
                styleTag = document.createElement("style");
                styleTag.id = "user-theme-styles";
                document.head.appendChild(styleTag);
            }
            styleTag.textContent = css;
        }

        loadTheme();
    });

    onMount(() => {
        const handleKeydown = (e: KeyboardEvent) => {
            shortcutManager.handleKeyEvent(e);
        };
        // Use capture phase to ensure shortcuts are handled before other listeners if needed,
        // matching the behavior of the previous manual implementations.
        window.addEventListener("keydown", handleKeydown, { capture: true });
        return () => {
            window.removeEventListener("keydown", handleKeydown, { capture: true });
        };
    });
</script>

<ConfirmationModal />
<GlobalTooltip />
{@render children()}
