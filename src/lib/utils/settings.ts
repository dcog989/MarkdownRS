import { appState } from '$lib/stores/appState.svelte.ts';
import { Store } from '@tauri-apps/plugin-store';
// We use the official log plugin to write explicit entries if needed,
// OR just rely on console.log which is now piped.
import { error, info } from '@tauri-apps/plugin-log';

let store: Store | null = null;

// The plugin automatically captures console.log, but we can use explicit Rust logger
// for structured output if preferred. Here we use the plugin's direct exports.
function log(msg: string, level: 'debug' | 'info' | 'error' = 'debug') {
    if (level === 'error') {
        console.error(`[Settings] ${msg}`);
        error(`[Settings] ${msg}`);
    } else {
        console.log(`[Settings] ${msg}`);
        info(`[Settings] ${msg}`);
    }
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
