import { type OperationId } from '$lib/config/textOperationsRegistry';
import { textProcessor } from '$lib/services/textProcessor';

/**
 * Unified text transformation entry point.
 * Delegates to the TextProcessor service.
 */
export async function transformText(text: string, operationId: OperationId): Promise<string> {
    return textProcessor.process(operationId, text);
}
