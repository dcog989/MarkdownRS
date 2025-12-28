import { appContext } from '$lib/stores/state.svelte.ts';
import { callBackend } from './backend';
import { debounce } from './timing';

let lastSavedState: string = '';

function log(msg: string, level: 'debug' | 'info' | 'error' = 'debug') {
    const output = `[Settings] ${msg}`;
    if (level === 'error') console.error(output);
    else console.log(output);
}

function getSettingsObject() {
    return {
        splitPercentage: appContext.app.splitPercentage,
        splitOrientation: appContext.app.splitOrientation,
        splitView: appContext.app.splitView,
        activeTheme: appContext.app.activeTheme,
        tabCycling: appContext.app.tabCycling,
        tabWidthMin: appContext.app.tabWidthMin,
        tabWidthMax: appContext.app.tabWidthMax,
        editorFontFamily: appContext.app.editorFontFamily,
        editorFontSize: appContext.app.editorFontSize,
        editorWordWrap: appContext.app.editorWordWrap,
        showWhitespace: appContext.app.showWhitespace,
        enableAutocomplete: appContext.app.enableAutocomplete,
        recentChangesMode: appContext.app.recentChangesMode,
        recentChangesTimespan: appContext.app.recentChangesTimespan,
        recentChangesCount: appContext.app.recentChangesCount,
        undoDepth: appContext.app.undoDepth,
        previewFontFamily: appContext.app.previewFontFamily,
        previewFontSize: appContext.app.previewFontSize,
        markdownFlavor: appContext.app.markdownFlavor,
        logLevel: appContext.app.logLevel,
        statusBarTransparency: appContext.app.statusBarTransparency,
        newTabPosition: appContext.app.newTabPosition,
        formatOnSave: appContext.app.formatOnSave,
        formatOnPaste: appContext.app.formatOnPaste,
        defaultIndent: appContext.app.defaultIndent,
        formatterBulletChar: appContext.app.formatterBulletChar,
        formatterCodeFence: appContext.app.formatterCodeFence,
        formatterTableAlignment: appContext.app.formatterTableAlignment,
        startupBehavior: appContext.app.startupBehavior,
        lineEndingPreference: appContext.app.lineEndingPreference,
        tooltipDelay: appContext.app.tooltipDelay,
        findPanelTransparent: appContext.app.findPanelTransparent,
        findPanelCloseOnBlur: appContext.app.findPanelCloseOnBlur
    };
}

export async function initSettings() {
    try {
        const saved = await callBackend('load_settings', {}, 'Settings:Load');

        if (saved && Object.keys(saved).length > 0) {
            log(`Restoring app preferences from TOML...`);
            Object.keys(saved).forEach(key => {
                if (key === 'formatterListIndent') {
                    appContext.app.defaultIndent = saved[key];
                } else if (key in appContext.app) {
                    (appContext.app as any)[key] = saved[key];
                }
            });
        }

        lastSavedState = JSON.stringify(getSettingsObject());
    } catch (err) {
        log(`Failed to load settings: ${err}`, 'error');
    }
}

async function saveSettingsImmediate() {
    try {
        const settingsToSave = getSettingsObject();
        const serialized = JSON.stringify(settingsToSave);

        if (serialized === lastSavedState) {
            return;
        }

        await callBackend('save_settings', { settings: settingsToSave }, 'Settings:Save');
        lastSavedState = serialized;
    } catch (err) {
        log(`Failed to save settings: ${err}`, 'error');
    }
}

export const saveSettings = debounce(saveSettingsImmediate, 500);
export const saveSettingsNow = saveSettingsImmediate;
