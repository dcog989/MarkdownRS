<script lang="ts">
    import { applyTheme } from "$lib/utils/colors";
    import { onMount } from "svelte";
    import "../app.css";
    let { children } = $props();

    onMount(() => {
        applyTheme();
    });
</script>

{@render children()}
