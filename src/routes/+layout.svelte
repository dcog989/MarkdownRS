<script lang="ts">
    import ConfirmationModal from "$lib/components/ui/ConfirmationModal.svelte";
    import GlobalTooltip from "$lib/components/ui/GlobalTooltip.svelte";
    import { applyTheme } from "$lib/utils/colors";
    import { onMount } from "svelte";
    import "../app.css";

    let { children } = $props();

    onMount(() => {
        applyTheme();
    });
</script>

<ConfirmationModal />
<GlobalTooltip />
{@render children()}
