<script lang="ts">
    import ConfirmationModal from "$lib/components/ui/ConfirmationModal.svelte";
    import { applyTheme } from "$lib/utils/colors";
    import { onMount } from "svelte";
    import "../app.css";

    let { children } = $props();

    onMount(() => {
        applyTheme();
    });
</script>

<ConfirmationModal />
{@render children()}
