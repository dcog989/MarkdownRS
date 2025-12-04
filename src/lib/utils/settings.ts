import { appState } from '$lib/stores/appState.svelte.ts';
import { Store } from '@tauri-apps/plugin-store';

let store: Store | null = null;

function log(msg: string, level: 'debug' | 'info' | 'error' = 'debug') {
    const output = `[Settings] ${msg}`;
    if (level === 'error') console.error(output);
    else console.log(output);
}

export async function initSettings() {
    try {
        store = await Store.load('settings.json');

        const saved = await store.get<{
            splitPercentage: number;
            splitOrientation: 'vertical' | 'horizontal';
            splitView: boolean;
            tabCycling: 'mru' | 'sequential';
            tabWidthMin: number;
            tabWidthMax: number;
            editorFontFamily: string;
            editorFontSize: number;
            previewFontFamily: string;
            previewFontSize: number;
            logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
        }>('app-settings');

        if (saved) {
            log(`Restoring app preferences...`);
            if (saved.splitPercentage !== undefined) appState.splitPercentage = saved.splitPercentage;
            if (saved.splitOrientation) appState.splitOrientation = saved.splitOrientation;
            if (typeof saved.splitView === 'boolean') appState.splitView = saved.splitView;
            if (saved.tabCycling) appState.tabCycling = saved.tabCycling;

            if (saved.tabWidthMin) appState.tabWidthMin = saved.tabWidthMin;
            if (saved.tabWidthMax) appState.tabWidthMax = saved.tabWidthMax;

            if (saved.editorFontFamily) appState.editorFontFamily = saved.editorFontFamily;
            if (saved.editorFontSize) appState.editorFontSize = saved.editorFontSize;
            if (saved.previewFontFamily) appState.previewFontFamily = saved.previewFontFamily;
            if (saved.previewFontSize) appState.previewFontSize = saved.previewFontSize;
            if (saved.logLevel) appState.logLevel = saved.logLevel;
        }
    } catch (err) {
        log(`Failed to load settings: ${err}`, 'error');
    }
}

export async function saveSettings() {
    if (!store) return;

    try {
        const currentStored = (await store.get('app-settings') as any) || {};

        const newSettings = {
            ...currentStored,
            splitPercentage: appState.splitPercentage,
            splitOrientation: appState.splitOrientation,
            splitView: appState.splitView,
            tabCycling: appState.tabCycling,
            tabWidthMin: appState.tabWidthMin,
            tabWidthMax: appState.tabWidthMax,
            editorFontFamily: appState.editorFontFamily,
            editorFontSize: appState.editorFontSize,
            previewFontFamily: appState.previewFontFamily,
            previewFontSize: appState.previewFontSize,
            logLevel: appState.logLevel
        };

        await store.set('app-settings', newSettings);
        await store.save();
    } catch (err) {
        log(`Failed to save settings: ${err}`, 'error');
    }
}
