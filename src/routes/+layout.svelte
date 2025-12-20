<script lang="ts">
    import ConfirmationModal from "$lib/components/ui/ConfirmationModal.svelte";
    import GlobalTooltip from "$lib/components/ui/GlobalTooltip.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import "../app.css";

    let { children } = $props();

    $effect(() => {
        const theme = appState.theme;
        const root = document.documentElement;
        root.setAttribute("data-theme", theme);
        root.style.colorScheme = theme;
    });
</script>

<ConfirmationModal />
<GlobalTooltip />
{@render children()}
