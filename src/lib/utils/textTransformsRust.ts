import { appContext } from '$lib/stores/state.svelte.ts';
import type { TextTransformId } from '$lib/types/api';
import { callBackend } from './backend';
import { AppError } from './errorHandling';

export async function transformText(text: string, operation: string): Promise<string> {
    try {
        return await callBackend('transform_text_content', {
            content: text,
            operation: operation as TextTransformId,
            indentWidth: appContext.app.defaultIndent
        }, 'Transform:Text');
    } catch (e) {
        AppError.handle('Transform:Text', e, { showToast: true, severity: 'warning' });
        return text;
    }
}
