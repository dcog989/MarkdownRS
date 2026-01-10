import { getOperation, type OperationId } from "$lib/config/textOperationsRegistry";
import { appContext } from "$lib/stores/state.svelte.ts";
import { applyClientTransform } from "./clientTransforms";
import { formatMarkdown } from "./formatterRust";

/**
 * Unified text transformation entry point.
 * Routes operations to either client-side logic or server-side Rust commands.
 */
export async function transformText(text: string, operationId: OperationId): Promise<string> {
    const op = getOperation(operationId);
    if (!op) return text;

    // Client-side operations
    if (op.execution === "client") {
        const indent = appContext.app.defaultIndent;
        return applyClientTransform(text, operationId, indent);
    }

    // Server-side: Format Document
    if (operationId === "format-document") {
        return formatMarkdown(text);
    }

    return text;
}
