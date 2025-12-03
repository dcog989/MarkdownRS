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
            width: number;
            height: number;
            x: number;
            y: number;
            isMaximized: boolean;
        }>('app-settings');

        if (saved) {
            log(`Restoring layout state...`);
            if (saved.splitPercentage !== undefined) appState.splitPercentage = saved.splitPercentage;
            if (saved.splitOrientation) appState.splitOrientation = saved.splitOrientation;
            if (typeof saved.splitView === 'boolean') appState.splitView = saved.splitView;
            if (saved.tabCycling) appState.tabCycling = saved.tabCycling;
            if (saved.tabWidthMin) appState.tabWidthMin = saved.tabWidthMin;
            if (saved.tabWidthMax) appState.tabWidthMax = saved.tabWidthMax;
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
            tabWidthMax: appState.tabWidthMax
        };

        await store.set('app-settings', newSettings);
        await store.save();
    } catch (err) {
        log(`Failed to save settings: ${err}`, 'error');
    }
}
