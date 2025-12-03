import { appState } from '$lib/stores/appState.svelte.ts';
import { Store } from '@tauri-apps/plugin-store';

let store: Store | null = null;

// Simple logger wrapper. The Rust plugin captures console.* automatically.
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
        }>('app-settings');

        if (saved) {
            log(`Restoring layout state...`);
            if (saved.splitPercentage) appState.splitPercentage = saved.splitPercentage;
            if (saved.splitOrientation) appState.splitOrientation = saved.splitOrientation;
            if (typeof saved.splitView === 'boolean') appState.splitView = saved.splitView;
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
        };

        await store.set('app-settings', newSettings);
        await store.save();
    } catch (err) {
        log(`Failed to save settings: ${err}`, 'error');
    }
}
