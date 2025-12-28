import { appState } from '$lib/stores/appState.svelte';
import { callBackend } from './backend';
import { AppError } from './errorHandling';

/**
 * Performs text transformations using the Rust backend via unified bridge
 */
export async function transformText(text: string, operation: string): Promise<string> {
    try {
        return await callBackend('transform_text_content', {
            content: text,
            operation,
            indentWidth: appState.defaultIndent
        }, 'Transform:Text');
    } catch (e) {
        AppError.handle('Transform:Text', e, { showToast: true, severity: 'warning' });
        return text;
    }
}
