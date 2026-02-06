<script lang="ts">
    import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
    import GlobalTooltip from '$lib/components/ui/GlobalTooltip.svelte';
    import ModalManager from '$lib/components/ui/ModalManager.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { registerAllShortcuts } from '$lib/utils/registerShortcuts';
    import { shortcutManager } from '$lib/utils/shortcuts';
    import { getThemeCss } from '$lib/utils/themes';
    import { onMount } from 'svelte';
    import '../app.css';

    let { children } = $props();

    $effect(() => {
        const theme = appContext.app.theme;
        const root = document.documentElement;
        root.setAttribute('data-theme', theme);
        root.style.colorScheme = theme;
    });

    $effect(() => {
        const themeName = appContext.app.activeTheme;
        if (!themeName) return;

        async function loadTheme() {
            const css = await getThemeCss(themeName);
            if (!css) return;

            let styleTag = document.getElementById('user-theme-styles') as HTMLStyleElement;
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'user-theme-styles';
                document.head.appendChild(styleTag);
            }
            styleTag.textContent = css;
        }

        loadTheme();
    });

    onMount(() => {
        // Register all keyboard shortcuts
        registerAllShortcuts();

        const handleKeydown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const isCtrl = e.ctrlKey || e.metaKey;

            // Prevent default for browser shortcuts that conflict with app shortcuts
            if (isCtrl && key === 'p') {
                e.preventDefault();
            }

            // Let shortcut manager handle the event
            void shortcutManager.handleKeyEvent(e);
        };

        // Prevent browser context menu globally
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        window.addEventListener('keydown', handleKeydown, { capture: true });
        document.addEventListener('contextmenu', handleContextMenu, { passive: false });

        return () => {
            window.removeEventListener('keydown', handleKeydown, { capture: true });
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    });
</script>

<ConfirmationModal />
<GlobalTooltip />
<ModalManager />
{@render children()}
