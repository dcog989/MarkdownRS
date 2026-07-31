<script lang="ts">
import { onMount } from 'svelte';
import { commands } from '$lib/commands/commands';
import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
import GlobalTooltip from '$lib/components/ui/GlobalTooltip.svelte';
import ModalManager from '$lib/components/ui/ModalManager.svelte';
import { syncThemeFromSystem } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { logger } from '$lib/utils/logger';
import { shortcutManager } from '$lib/utils/shortcuts';
import { getThemeCss, isModeFollowingTheme } from '$lib/utils/themes';
import '../app.css';

let { children } = $props();

$effect(() => {
    const theme = appContext.settings.theme;
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
});

$effect(() => {
    const themeName = appContext.settings.activeTheme;
    if (!themeName || themeName === 'System') {
        const existing = document.getElementById('user-theme-styles');
        if (existing) existing.remove();
        return;
    }

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
        logger.editor.warn('UnhandledRejection', { reason: event.reason });
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

        // Let shortcut manager handle the event
        void shortcutManager.handleKeyEvent(e);
    };

    // Prevent browser context menu globally
    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
    };

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleOSThemeChange = () => {
        const { activeTheme } = appContext.settings;
        if (activeTheme === 'System' || isModeFollowingTheme(activeTheme)) {
            syncThemeFromSystem();
        }
    };
    mq.addEventListener('change', handleOSThemeChange);

    window.addEventListener('keydown', handleKeydown, { capture: true });
    document.addEventListener('contextmenu', handleContextMenu, { passive: false });
    return () => {
        window.removeEventListener('unhandledrejection', onUnhandledRejection);
        mq.removeEventListener('change', handleOSThemeChange);
        window.removeEventListener('keydown', handleKeydown, { capture: true });
        document.removeEventListener('contextmenu', handleContextMenu);
    };
});
</script>

<ConfirmationModal />
<GlobalTooltip />
<ModalManager />
{@render children()}
