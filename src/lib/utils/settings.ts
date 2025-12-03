import { appState } from '$lib/stores/appState.svelte.ts';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { Store } from '@tauri-apps/plugin-store';

let store: Store | null = null;
const appWindow = getCurrentWindow();

// Helper to pipe logs to Rust
function log(msg: string, level: 'debug' | 'info' | 'error' = 'debug') {
    invoke('log_frontend', { level, message: msg }).catch(console.error);
    if (level === 'error') console.error(`[Settings] ${msg}`);
    else console.log(`[Settings] ${msg}`);
}

export async function initSettings() {
    try {
        store = await Store.load('settings.json');

        const saved = await store.get<{
            splitPercentage: number;
            splitOrientation: 'vertical' | 'horizontal';
            width: number;
            height: number;
            x: number;
            y: number;
            isMaximized: boolean;
        }>('app-settings');

        if (saved) {
            log(`Restoring state: Max=${saved.isMaximized}, Pos=${saved.x},${saved.y}, Size=${saved.width}x${saved.height} (Physical)`);

            if (saved.splitPercentage) appState.splitPercentage = saved.splitPercentage;
            if (saved.splitOrientation) appState.splitOrientation = saved.splitOrientation;

            if (saved.isMaximized) {
                await appWindow.maximize();
            } else if (saved.width && saved.height) {
                // Ensure we don't restore weird zero/negative values
                if (saved.width > 0 && saved.height > 0) {
                    await appWindow.setSize(new PhysicalSize(saved.width, saved.height));
                }

                if (saved.x != null && saved.y != null) {
                    await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
                }
            }
        } else {
            log("No saved settings found.");
        }
    } catch (err) {
        log(`Failed to load settings: ${err}`, 'error');
    }
}

export async function saveSettings() {
    if (!store) {
        log("Store not initialized", 'error');
        return;
    }

    try {
        const isMaximized = await appWindow.isMaximized();
        const currentStored = (await store.get('app-settings') as any) || {};

        const newSettings = {
            ...currentStored,
            splitPercentage: appState.splitPercentage,
            splitOrientation: appState.splitOrientation,
            isMaximized
        };

        if (!isMaximized) {
            const size = await appWindow.innerSize();
            const pos = await appWindow.outerPosition();

            newSettings.width = size.width;
            newSettings.height = size.height;
            newSettings.x = pos.x;
            newSettings.y = pos.y;

            log(`Saving Geometry (Physical): ${pos.x},${pos.y} / ${size.width}x${size.height}`);
        } else {
            log(`Window maximized, preserving previous geometry.`);
        }

        await store.set('app-settings', newSettings);
        await store.save();
    } catch (err) {
        log(`Failed to save settings: ${err}`, 'error');
    }
}
