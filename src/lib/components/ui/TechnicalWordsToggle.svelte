<script lang="ts">
    interface Props {
        enabled: boolean;
        onChange: (enabled: boolean) => void;
    }

    let { enabled = $bindable(false), onChange }: Props = $props();

    function toggle() {
        onChange(!enabled);
    }
</script>

<input
    id="technical-words-toggle"
    type="checkbox"
    checked={enabled}
    onchange={toggle}
    class="w-4 h-4 rounded cursor-pointer accent-accent-primary" />
