import type { BackendCommands, CommandName } from '$lib/types/api';
import { invoke } from '@tauri-apps/api/core';
import { AppError, type ErrorContext } from './errorHandling';

export interface BackendCallOptions {
	report?: boolean;
	ignore?: boolean;
	msg?: string;
}

/**
 * Call a backend command with proper error handling.
 * 
 * @param command - The backend command to invoke
 * @param args - Arguments for the command
 * @param context - Error context for logging
 * @param additionalInfo - Additional information to include in error reports
 * @param options - Call options:
 *   - `report`: If true, report error but don't throw (returns null on error)
 *   - `ignore`: If true, suppress error completely (returns null on error)
 *   - `msg`: Custom user-facing error message
 * @returns The command result, or null if error is ignored/reported
 */
export async function callBackend<K extends CommandName>(
	command: K,
	args: BackendCommands[K]['args'],
	context: ErrorContext,
	additionalInfo?: Record<string, any>,
	options?: BackendCallOptions & { ignore: true }
): Promise<BackendCommands[K]['return'] | null>;

export async function callBackend<K extends CommandName>(
	command: K,
	args: BackendCommands[K]['args'],
	context: ErrorContext,
	additionalInfo?: Record<string, any>,
	options?: BackendCallOptions & { report: true }
): Promise<BackendCommands[K]['return'] | null>;

export async function callBackend<K extends CommandName>(
	command: K,
	args: BackendCommands[K]['args'],
	context: ErrorContext,
	additionalInfo?: Record<string, any>,
	options?: BackendCallOptions
): Promise<BackendCommands[K]['return']>;

export async function callBackend<K extends CommandName>(
	command: K,
	args: BackendCommands[K]['args'],
	context: ErrorContext,
	additionalInfo?: Record<string, any>,
	options?: BackendCallOptions
): Promise<BackendCommands[K]['return'] | null> {
	try {
		return await invoke<BackendCommands[K]['return']>(command, args);
	} catch (err) {
		const errorOpts = {
			additionalInfo: { command, ...args, ...additionalInfo },
			severity: 'error' as const,
			userMessage: options?.msg,
			showToast: options?.report ? true : options?.ignore ? false : true
		};

		// Report error but don't throw - return null to indicate failure
		if (options?.report) {
			AppError.handle(context, err, errorOpts);
			return null;
		}

		// Silently ignore error - return null
		if (options?.ignore) {
			return null;
		}

		// Normal error - throw to caller
		throw AppError.from(context, err, errorOpts);
	}
}
