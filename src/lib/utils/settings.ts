import { appState } from '$lib/stores/appState.svelte.ts';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { Store } from '@tauri-apps/plugin-store';

let store: Store | null = null;
const appWindow = getCurrentWindow();

// Force info level to ensure it hits the log file
function log(msg: string) {
    console.log(`[Settings] ${msg}`);
    invoke('log_frontend', { level: 'info', message: `[Settings] ${msg}` }).catch(e => console.error(e));
}

export async function initSettings() {
    log("Starting initialization...");
    try {
        store = await Store.load('settings.json');

        const saved = await store.get<{
            splitPercentage: number;
            splitOrientation: 'vertical' | 'horizontal';
            splitView: boolean;
            width: number;
            height: number;
            x: number;
            y: number;
            isMaximized: boolean;
        }>('app-settings');

        if (saved) {
            log(`RAW SAVED DATA: ${JSON.stringify(saved)}`);

            // Apply App State
            if (saved.splitPercentage) appState.splitPercentage = saved.splitPercentage;
            if (saved.splitOrientation) appState.splitOrientation = saved.splitOrientation;
            if (typeof saved.splitView === 'boolean') appState.splitView = saved.splitView;

            // Apply Window State
            if (saved.isMaximized) {
                log("Applying Maximize");
                await appWindow.maximize();
            } else if (saved.width && saved.height) {
                log(`Applying Physical Size: ${saved.width}x${saved.height}`);
                await appWindow.setSize(new PhysicalSize(saved.width, saved.height));

                if (saved.x != null && saved.y != null) {
                    log(`Applying Physical Pos: ${saved.x}, ${saved.y}`);
                    await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
                }
            }

            // Verify final position
            const finalPos = await appWindow.outerPosition();
            log(`VERIFY FINAL POS: ${finalPos.x}, ${finalPos.y}`);

        } else {
            log("No saved settings found in store.");
        }
    } catch (err) {
        log(`CRITICAL FAILURE: ${err}`);
    }
}

export async function saveSettings() {
    if (!store) return;

    try {
        const isMaximized = await appWindow.isMaximized();
        const currentStored = (await store.get('app-settings') as any) || {};

        const newSettings = {
            ...currentStored,
            splitPercentage: appState.splitPercentage,
            splitOrientation: appState.splitOrientation,
            splitView: appState.splitView,
            isMaximized
        };

        if (!isMaximized) {
            const size = await appWindow.innerSize();
            const pos = await appWindow.outerPosition();

            newSettings.width = size.width;
            newSettings.height = size.height;
            newSettings.x = pos.x;
            newSettings.y = pos.y;

            // Log only occasionally or on specific debug triggers to avoid spam,
            // but for now we need data:
            log(`Saving Geometry: ${pos.x},${pos.y} / ${size.width}x${size.height}`);
        }

        await store.set('app-settings', newSettings);
        await store.save();
    } catch (err) {
        log(`Save failed: ${err}`);
    }
}
