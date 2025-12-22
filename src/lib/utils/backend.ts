import { invoke } from '@tauri-apps/api/core';
import { AppError, type ErrorContext } from './errorHandling';

/**
 * Standardized wrapper for Rust backend communication.
 * Automatically handles centralized error logging.
 */
export async function callBackend<T>(
    command: string,
    args: Record<string, any> = {},
    context: ErrorContext,
    additionalInfo?: Record<string, any>
): Promise<T> {
    try {
        return await invoke<T>(command, args);
    } catch (err) {
        AppError.log(context, err, { command, ...args, ...additionalInfo });
        throw err;
    }
}
