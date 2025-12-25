import { invoke } from '@tauri-apps/api/core';
import { AppError, type ErrorContext } from './errorHandling';

/**
 * Standardized wrapper for Rust backend communication.
 * Automatically handles centralized error logging with enhanced error handling.
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
		// Create AppError with full context but don't show toast by default
		// The calling function can decide whether to show toast
		throw AppError.from(context, err, {
			additionalInfo: { command, ...args, ...additionalInfo },
			severity: 'error'
		});
	}
}
