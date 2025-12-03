import { appState } from '$lib/stores/appState.svelte.ts';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { Store } from '@tauri-apps/plugin-store';

let store: Store | null = null;
const appWindow = getCurrentWindow();

export async function initSettings() {
    try {
        store = await Store.load('settings.json');
        console.log("Settings: Store loaded");

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
            console.log("Settings: Found saved state", saved);

            // Restore App State
            if (saved.splitPercentage) appState.splitPercentage = saved.splitPercentage;
            if (saved.splitOrientation) appState.splitOrientation = saved.splitOrientation;

            // Restore Window State
            if (saved.isMaximized) {
                console.log("Settings: Restoring maximized");
                await appWindow.maximize();
            } else if (saved.width && saved.height) {
                console.log(`Settings: Restoring Size: ${saved.width}x${saved.height}`);
                await appWindow.setSize(new PhysicalSize(saved.width, saved.height));

                if (saved.x != null && saved.y != null) {
                    console.log(`Settings: Restoring Pos: ${saved.x}, ${saved.y}`);
                    await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
                }
            }
        } else {
            console.log("Settings: No saved state found");
        }
    } catch (err) {
        console.error('Settings: Failed to load:', err);
    }
}

export async function saveSettings() {
    if (!store) return;

    try {
        const isMaximized = await appWindow.isMaximized();

        // Use Physical (Pixel) values
        const size = await appWindow.innerSize();
        const pos = await appWindow.outerPosition();

        const settings = {
            splitPercentage: appState.splitPercentage,
            splitOrientation: appState.splitOrientation,
            width: size.width,
            height: size.height,
            x: pos.x,
            y: pos.y,
            isMaximized
        };

        // console.log("Settings: Saving", settings); // Uncomment to debug save frequency

        await store.set('app-settings', settings);
        await store.save();
    } catch (err) {
        console.error('Settings: Failed to save:', err);
    }
}
