import { appState } from '$lib/stores/appState.svelte';
import type { TextTransformId } from '$lib/types/api';
import { callBackend } from './backend';
import { AppError } from './errorHandling';

/**
 * Performs text transformations using the Rust backend via unified bridge
 */
export async function transformText(text: string, operation: string): Promise<string> {
    try {
        // Cast to TextTransformId as we know the registry logic filters invalid ops,
        // but the strict typing in callBackend requires this match.
        return await callBackend('transform_text_content', {
            content: text,
            operation: operation as TextTransformId,
            indentWidth: appState.defaultIndent
        }, 'Transform:Text');
    } catch (e) {
        AppError.handle('Transform:Text', e, { showToast: true, severity: 'warning' });
        return text;
    }
}
