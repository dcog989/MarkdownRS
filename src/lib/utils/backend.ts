import type { BackendCommands, CommandName } from '$lib/types/api';
import { invoke } from '@tauri-apps/api/core';
import { AppError, type ErrorContext } from './errorHandling';

/**
 * Standardized wrapper for Rust backend communication with strong typing.
 * Automatically handles centralized error logging.
 *
 * @param command - The name of the Rust command to invoke
 * @param args - Arguments matching the command signature
 * @param context - Error context for logging
 * @param additionalInfo - Optional extra info for error logging
 */
export async function callBackend<K extends CommandName>(
	command: K,
	args: BackendCommands[K]['args'],
	context: ErrorContext,
	additionalInfo?: Record<string, any>
): Promise<BackendCommands[K]['return']> {
	try {
		return await invoke<BackendCommands[K]['return']>(command, args);
	} catch (err) {
		throw AppError.from(context, err, {
			additionalInfo: { command, ...args, ...additionalInfo },
			severity: 'error'
		});
	}
}
