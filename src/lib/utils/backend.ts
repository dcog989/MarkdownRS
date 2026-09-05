import { invoke } from "@tauri-apps/api/core";
import type { BackendCommands, CommandName } from "$lib/types/api";
import { AppError, type ErrorContext, type ErrorOptions } from "./errorHandling";

export interface BackendCallOptions {
  report?: boolean;
  ignore?: boolean;
  msg?: string;
}

export interface SafeCallOptions extends ErrorOptions {
  onError?: (err: unknown) => void | Promise<void>;
}

/**
 * Call a backend command with proper error handling.
 */
export async function callBackend<K extends CommandName>(
  command: K,
  args: BackendCommands[K]["args"],
  context: ErrorContext,
  additionalInfo?: Record<string, unknown>,
  options?: BackendCallOptions & { ignore: true },
): Promise<BackendCommands[K]["return"] | null>;

export async function callBackend<K extends CommandName>(
  command: K,
  args: BackendCommands[K]["args"],
  context: ErrorContext,
  additionalInfo?: Record<string, unknown>,
  options?: BackendCallOptions & { report: true },
): Promise<BackendCommands[K]["return"] | null>;

export async function callBackend<K extends CommandName>(
  command: K,
  args: BackendCommands[K]["args"],
  context: ErrorContext,
  additionalInfo?: Record<string, unknown>,
  options?: BackendCallOptions,
): Promise<BackendCommands[K]["return"]>;

export async function callBackend<K extends CommandName>(
  command: K,
  args: BackendCommands[K]["args"],
  context: ErrorContext,
  additionalInfo?: Record<string, unknown>,
  options?: BackendCallOptions,
): Promise<BackendCommands[K]["return"] | null> {
  try {
    const result = await invoke<BackendCommands[K]["return"]>(command, args);
    return result;
  } catch (err) {
    const errorOpts = {
      additionalInfo: {
        command,
        ...args,
        ...additionalInfo,
      } as Record<string, unknown>,
      severity: "error" as const,
      userMessage: options?.msg,
      showToast: options?.report ? true : !options?.ignore,
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

/**
 * Higher-order function that wraps callBackend with try-catch and AppError.handle.
 *
 * @param command - The backend command to execute
 * @param args - Arguments for the command
 * @param context - Error context for logging
 * @param options - Error handling options
 * @returns Promise that resolves to the result or null if error is handled
 */
export async function callBackendSafe<K extends CommandName>(
  command: K,
  args: BackendCommands[K]["args"],
  context: ErrorContext,
  options: SafeCallOptions = {},
): Promise<BackendCommands[K]["return"] | null> {
  try {
    return await callBackend(command, args, context, undefined, { ignore: false });
  } catch (err) {
    // Custom error handler if provided
    if (options.onError) {
      await options.onError(err);
    }

    // Handle with AppError by default
    AppError.handle(context, err, {
      showToast: options.showToast,
      userMessage: options.userMessage,
      toastDuration: options.toastDuration,
      additionalInfo: options.additionalInfo,
      severity: options.severity,
      logToDisk: options.logToDisk,
    });

    return null;
  }
}
