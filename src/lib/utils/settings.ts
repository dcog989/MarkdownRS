import { appState } from '$lib/stores/appState.svelte.ts';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { Store } from '@tauri-apps/plugin-store';

let store: Store | null = null;
const appWindow = getCurrentWindow();

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
            // Restore App State
            if (saved.splitPercentage) appState.splitPercentage = saved.splitPercentage;
            if (saved.splitOrientation) appState.splitOrientation = saved.splitOrientation;

            // Restore Window State
            if (saved.isMaximized) {
                await appWindow.maximize();
            } else if (saved.width && saved.height) {
                // Use PhysicalSize for exact pixel restoration
                await appWindow.setSize(new PhysicalSize(saved.width, saved.height));

                if (saved.x != null && saved.y != null) {
                    await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
                }
            }
        }
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

export async function saveSettings() {
    if (!store) return;

    try {
        const isMaximized = await appWindow.isMaximized();

        // Save Physical (Pixel) values to avoid DPI math errors on restore
        const size = await appWindow.innerSize();
        const pos = await appWindow.outerPosition();

        await store.set('app-settings', {
            splitPercentage: appState.splitPercentage,
            splitOrientation: appState.splitOrientation,
            width: size.width,
            height: size.height,
            x: pos.x,
            y: pos.y,
            isMaximized
        });
        await store.save();
    } catch (err) {
        console.error('Failed to save settings:', err);
    }
}
