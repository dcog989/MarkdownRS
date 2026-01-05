import type { BackendCommands, CommandName } from '$lib/types/api';
import { invoke } from '@tauri-apps/api/core';
import { AppError, type ErrorContext } from './errorHandling';

export interface BackendCallOptions {
	report?: boolean;
	ignore?: boolean;
	msg?: string;
}

export async function callBackend<K extends CommandName>(
	command: K,
	args: BackendCommands[K]['args'],
	context: ErrorContext,
	additionalInfo?: Record<string, any>,
	options?: BackendCallOptions
): Promise<BackendCommands[K]['return']> {
	try {
		return await invoke<BackendCommands[K]['return']>(command, args);
	} catch (err) {
		const errorOpts = {
			additionalInfo: { command, ...args, ...additionalInfo },
			severity: 'error' as const,
			userMessage: options?.msg,
			showToast: true
		};

		if (options?.report) {
			AppError.handle(context, err, errorOpts);
		}

		if (options?.ignore) {
			return undefined as any;
		}

		throw AppError.from(context, err, errorOpts);
	}
}
