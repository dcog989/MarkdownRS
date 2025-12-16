import { appState } from '$lib/stores/appState.svelte.ts';
import { Store } from '@tauri-apps/plugin-store';
import { debounce } from './async';

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
            editorWordWrap: boolean;
            enableAutocomplete: boolean;
            previewFontFamily: string;
            previewFontSize: number;
            logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
            statusBarTransparency: number;
            newTabPosition: 'right' | 'end';
            formatOnSave: boolean;
            formatOnPaste: boolean;
            formatterListIndent: number;
            formatterBulletChar: '-' | '*' | '+';
            formatterCodeFence: '```' | '~~~';
            formatterTableAlignment: boolean;
            startupBehavior: 'first' | 'last-focused' | 'new';
            lineEndingPreference: 'system' | 'LF' | 'CRLF';
            tooltipDelay: number;
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
            if (saved.editorWordWrap !== undefined) appState.editorWordWrap = saved.editorWordWrap;
            if (saved.enableAutocomplete !== undefined) appState.enableAutocomplete = saved.enableAutocomplete;
            if (saved.previewFontFamily) appState.previewFontFamily = saved.previewFontFamily;
            if (saved.previewFontSize) appState.previewFontSize = saved.previewFontSize;
            if (saved.logLevel) appState.logLevel = saved.logLevel;
            if (saved.statusBarTransparency !== undefined) appState.statusBarTransparency = saved.statusBarTransparency;
            if (saved.newTabPosition) appState.newTabPosition = saved.newTabPosition;
            if (saved.formatOnSave !== undefined) appState.formatOnSave = saved.formatOnSave;
            if (saved.formatOnPaste !== undefined) appState.formatOnPaste = saved.formatOnPaste;
            if (saved.formatterListIndent) appState.formatterListIndent = saved.formatterListIndent;
            if (saved.formatterBulletChar) appState.formatterBulletChar = saved.formatterBulletChar;
            if (saved.formatterCodeFence) appState.formatterCodeFence = saved.formatterCodeFence;
            if (saved.formatterTableAlignment !== undefined) appState.formatterTableAlignment = saved.formatterTableAlignment;
            if (saved.startupBehavior) appState.startupBehavior = saved.startupBehavior;
            if (saved.lineEndingPreference) appState.lineEndingPreference = saved.lineEndingPreference;
            if (saved.tooltipDelay !== undefined) appState.tooltipDelay = saved.tooltipDelay;
        }
    } catch (err) {
        log(`Failed to load settings: ${err}`, 'error');
    }
}

async function saveSettingsImmediate() {
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
            editorWordWrap: appState.editorWordWrap,
            enableAutocomplete: appState.enableAutocomplete,
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

        await store.set('app-settings', newSettings);
        await store.save();
    } catch (err) {
        log(`Failed to save settings: ${err}`, 'error');
    }
}

// Debounced version for frequent updates (e.g., sliders)
export const saveSettings = debounce(saveSettingsImmediate, 500);

// Immediate version for critical saves (e.g., window close)
export const saveSettingsNow = saveSettingsImmediate;
