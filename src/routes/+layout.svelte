<script lang="ts">
    import ConfirmationModal from "$lib/components/ui/ConfirmationModal.svelte";
    import GlobalTooltip from "$lib/components/ui/GlobalTooltip.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { invoke } from "@tauri-apps/api/core";
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
            try {
                const css = await invoke<string>("get_theme_css", { themeName });
                let styleTag = document.getElementById("user-theme-styles") as HTMLStyleElement;
                if (!styleTag) {
                    styleTag = document.createElement("style");
                    styleTag.id = "user-theme-styles";
                    document.head.appendChild(styleTag);
                }
                styleTag.textContent = css;
            } catch (err) {
                console.error("Theme Load Error:", err);
            }
        }

        loadTheme();
    });
</script>

<ConfirmationModal />
<GlobalTooltip />
{@render children()}
