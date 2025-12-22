import { callBackend } from './backend';

/**
 * Performs text transformations using the Rust backend via unified bridge
 */
export async function transformText(text: string, operation: string): Promise<string> {
    try {
        return await callBackend<string>('transform_text_content', {
            content: text,
            operation
        }, 'Transform:Text');
    } catch (e) {
        return text;
    }
}
