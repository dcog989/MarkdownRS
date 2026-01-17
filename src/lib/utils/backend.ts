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
 */
export async function callBackend<K extends CommandName>(
    command: K,
    args: BackendCommands[K]['args'],
    context: ErrorContext,
    additionalInfo?: Record<string, unknown>,
    options?: BackendCallOptions & { ignore: true },
): Promise<BackendCommands[K]['return'] | null>;

export async function callBackend<K extends CommandName>(
    command: K,
    args: BackendCommands[K]['args'],
    context: ErrorContext,
    additionalInfo?: Record<string, unknown>,
    options?: BackendCallOptions & { report: true },
): Promise<BackendCommands[K]['return'] | null>;

export async function callBackend<K extends CommandName>(
    command: K,
    args: BackendCommands[K]['args'],
    context: ErrorContext,
    additionalInfo?: Record<string, unknown>,
    options?: BackendCallOptions,
): Promise<BackendCommands[K]['return']>;

export async function callBackend<K extends CommandName>(
    command: K,
    args: BackendCommands[K]['args'],
    context: ErrorContext,
    additionalInfo?: Record<string, unknown>,
    options?: BackendCallOptions,
): Promise<BackendCommands[K]['return'] | null> {
    const start = performance.now();
    try {
        const result = await invoke<BackendCommands[K]['return']>(command, args);
        const duration = (performance.now() - start).toFixed(2);

        if (Number(duration) > 16) {
            console.debug(
                `[Bridge] ${command} | duration=${duration}ms | args=${JSON.stringify(args).substring(0, 100)}`,
            );
        }

        return result;
    } catch (err) {
        const duration = (performance.now() - start).toFixed(2);
        console.error(`[Bridge] ${command} FAILED | duration=${duration}ms | err=${err}`);

        const errorOpts = {
            additionalInfo: {
                command,
                ...args,
                ...additionalInfo,
            } as Record<string, unknown>,
            severity: 'error' as const,
            userMessage: options?.msg,
            showToast: options?.report ? true : options?.ignore ? false : true,
        };

        if (options?.report) {
            AppError.handle(context, err, errorOpts);
            return null;
        }

        if (options?.ignore) {
            return null;
        }

        throw AppError.from(context, err, errorOpts);
    }
}
