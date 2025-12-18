<script lang="ts">
    import ConfirmationModal from "$lib/components/ui/ConfirmationModal.svelte";
    import GlobalTooltip from "$lib/components/ui/GlobalTooltip.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { applyTheme } from "$lib/utils/colors";
    import { onMount } from "svelte";
    import "../app.css";

    let { children } = $props();

    $effect(() => {
        const theme = appState.theme;
        document.documentElement.setAttribute("data-theme", theme);
        applyTheme();
    });

    onMount(() => {
        applyTheme();
    });
</script>

<ConfirmationModal />
<GlobalTooltip />
{@render children()}
