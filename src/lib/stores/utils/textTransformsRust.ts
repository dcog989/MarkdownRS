import { invoke } from '@tauri-apps/api/core';

/**
 * Performs text transformations using the Rust backend
 */
export async function transformText(text: string, operation: string): Promise<string> {
    try {
        const result = await invoke<string>('transform_text_content', {
            content: text,
            operation
        });
        return result;
    } catch (e) {
        console.error(`[TextTransforms] Error performing ${operation}:`, e);
        // Fallback to returning original text on error
        return text;
    }
}
