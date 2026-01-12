import { appState } from '$lib/stores/appState.svelte';
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
        splitPercentage: appState.splitPercentage,
        splitOrientation: appState.splitOrientation,
        splitView: appState.splitView,
        activeTheme: appState.activeTheme,
        theme: appState.theme,
        tabCycling: appState.tabCycling,
        tabWidthMin: appState.tabWidthMin,
        tabWidthMax: appState.tabWidthMax,
        editorFontFamily: appState.editorFontFamily,
        editorFontSize: appState.editorFontSize,
        editorWordWrap: appState.editorWordWrap,
        showWhitespace: appState.showWhitespace,
        enableAutocomplete: appState.enableAutocomplete,
        autocompleteDelay: appState.autocompleteDelay,
        recentChangesTimespan: appState.recentChangesTimespan,
        recentChangesCount: appState.recentChangesCount,
        undoDepth: appState.undoDepth,
        previewFontFamily: appState.previewFontFamily,
        previewFontSize: appState.previewFontSize,
        markdownFlavor: appState.markdownFlavor,
        logLevel: appState.logLevel,
        statusBarTransparency: appState.statusBarTransparency,
        newTabPosition: appState.newTabPosition,
        formatOnSave: appState.formatOnSave,
        formatOnPaste: appState.formatOnPaste,
        defaultIndent: appState.defaultIndent,
        formatterBulletChar: appState.formatterBulletChar,
        formatterCodeFence: appState.formatterCodeFence,
        formatterTableAlignment: appState.formatterTableAlignment,
        startupBehavior: appState.startupBehavior,
        lineEndingPreference: appState.lineEndingPreference,
        tooltipDelay: appState.tooltipDelay,
        findPanelTransparent: appState.findPanelTransparent,
        findPanelCloseOnBlur: appState.findPanelCloseOnBlur,
        spellcheckDictionaries: appState.spellcheckDictionaries,
        technicalWords: appState.technicalWords,
        tabNameFromContent: appState.tabNameFromContent,
        wrapGuideColumn: appState.wrapGuideColumn,
        doubleClickSelectsTrailingSpace: appState.doubleClickSelectsTrailingSpace,
        collapsePinnedTabs: appState.collapsePinnedTabs,
        customShortcuts: appState.customShortcuts,
    };
}

export async function initSettings() {
    try {
        const saved = await callBackend('load_settings', {}, 'Settings:Load');

        if (saved && Object.keys(saved).length > 0) {
            log(`Restoring app preferences from TOML...`);
            Object.keys(saved).forEach((key) => {
                if (key in appState) {
                    (appState as any)[key] = saved[key];
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
