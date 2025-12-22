import { appState } from '$lib/stores/appState.svelte.ts';
import { Store } from '@tauri-apps/plugin-store';
import { debounce } from './timing';

let store: Store | null = null;

function log(msg: string, level: 'debug' | 'info' | 'error' = 'debug') {
    const output = `[Settings] ${msg}`;
    if (level === 'error') console.error(output);
    else console.log(output);
}

export async function initSettings() {
    try {
        const storePath = 'settings.json';
        store = await Store.load(storePath, {
            autoSave: false,
            defaults: {}
        });

        const saved = await store.get<Record<string, any>>('app-settings');

        if (saved) {
            log(`Restoring app preferences...`);
            Object.keys(saved).forEach(key => {
                if (key in appState) {
                    (appState as any)[key] = saved[key];
                }
            });
        }
    } catch (err) {
        log(`Failed to load settings: ${err}`, 'error');
    }
}

async function saveSettingsImmediate() {
    if (!store) return;

    try {
        const settingsToSave = {
            splitPercentage: appState.splitPercentage,
            splitOrientation: appState.splitOrientation,
            splitView: appState.splitView,
            activeTheme: appState.activeTheme,
            tabCycling: appState.tabCycling,
            tabWidthMin: appState.tabWidthMin,
            tabWidthMax: appState.tabWidthMax,
            editorFontFamily: appState.editorFontFamily,
            editorFontSize: appState.editorFontSize,
            editorWordWrap: appState.editorWordWrap,
            enableAutocomplete: appState.enableAutocomplete,
            recentChangesMode: appState.recentChangesMode,
            recentChangesTimespan: appState.recentChangesTimespan,
            recentChangesCount: appState.recentChangesCount,
            undoDepth: appState.undoDepth,
            previewFontFamily: appState.previewFontFamily,
            previewFontSize: appState.previewFontSize,
            logLevel: appState.logLevel,
            statusBarTransparency: appState.statusBarTransparency,
            newTabPosition: appState.newTabPosition,
            formatOnSave: appState.formatOnSave,
            formatOnPaste: appState.formatOnPaste,
            formatterListIndent: appState.formatterListIndent,
            formatterBulletChar: appState.formatterBulletChar,
            formatterCodeFence: appState.formatterCodeFence,
            formatterTableAlignment: appState.formatterTableAlignment,
            startupBehavior: appState.startupBehavior,
            lineEndingPreference: appState.lineEndingPreference,
            tooltipDelay: appState.tooltipDelay
        };

        await store.set('app-settings', settingsToSave);
        await store.save();
    } catch (err) {
        log(`Failed to save settings: ${err}`, 'error');
    }
}

export const saveSettings = debounce(saveSettingsImmediate, 500);
export const saveSettingsNow = saveSettingsImmediate;
