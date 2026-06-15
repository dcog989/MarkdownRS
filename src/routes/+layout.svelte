<script lang="ts">
import { onMount } from 'svelte';
import { commands } from '$lib/commands/commands';
import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
import GlobalTooltip from '$lib/components/ui/GlobalTooltip.svelte';
import ModalManager from '$lib/components/ui/ModalManager.svelte';
import { syncThemeFromActiveTheme } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { shortcutManager } from '$lib/utils/shortcuts';
import { getThemeCss } from '$lib/utils/themes';
import '../app.css';

let { children } = $props();

$effect(() => {
    const theme = appContext.settings.theme;
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
});

$effect(() => {
    const themeName = appContext.settings.activeTheme;
    if (!themeName || themeName === 'System') return;

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
    // Log unhandled promise rejections that aren't caught elsewhere
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
        console.warn('[App] Unhandled rejection:', event.reason);
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    for (const cmd of commands) {
        shortcutManager.register(cmd);
    }

    const handleKeydown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const isCtrl = e.ctrlKey || e.metaKey;

        // Prevent default for browser shortcuts that conflict with app shortcuts
        if (isCtrl && key === 'p') {
            e.preventDefault();
        }

        // Prevent browser's native fullscreen on F11
        if (key === 'f11') {
            e.preventDefault();
        }

        // Let shortcut manager handle the event
        void shortcutManager.handleKeyEvent(e);
    };

    // Prevent browser context menu globally
    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
    };

    // Sync writerMode with actual fullscreen state
    const handleFullscreenChange = () => {
        if (!document.fullscreenElement && appContext.app.writerMode) {
            appContext.app.writerMode = false;
        }
    };

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleOSThemeChange = () => {
        if (appContext.settings.activeTheme === 'System') {
            syncThemeFromActiveTheme();
        }
    };
    mq.addEventListener('change', handleOSThemeChange);

    window.addEventListener('keydown', handleKeydown, { capture: true });
    document.addEventListener('contextmenu', handleContextMenu, { passive: false });
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
        window.removeEventListener('unhandledrejection', onUnhandledRejection);
        mq.removeEventListener('change', handleOSThemeChange);
        window.removeEventListener('keydown', handleKeydown, { capture: true });
        document.removeEventListener('contextmenu', handleContextMenu);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
});
</script>

<ConfirmationModal />
<GlobalTooltip />
<ModalManager />
{@render children()}
