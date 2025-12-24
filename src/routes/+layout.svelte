<script lang="ts">
    import ConfirmationModal from "$lib/components/ui/ConfirmationModal.svelte";
    import GlobalTooltip from "$lib/components/ui/GlobalTooltip.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { getThemeCss } from "$lib/utils/themes";
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
</script>

<ConfirmationModal />
<GlobalTooltip />
<!-- Dedicated hidden container for exports to prevent UI flickering and layout issues -->
<div id="export-container" class="prose" aria-hidden="true"></div>
{@render children()}
