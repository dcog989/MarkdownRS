import { toastStore } from '$lib/stores/toastStore.svelte.ts';
import { error as logError, warn as logWarn, info as logInfo } from '@tauri-apps/plugin-log';

/**
 * Centralized error handling and logging utilities
 */

export type ErrorContext =
	| 'Session:Save'
	| 'Session:Load'
	| 'Session:Vacuum'
	| 'File:Read'
	| 'File:Write'
	| 'File:Metadata'
	| 'Markdown:Render'
	| 'Settings:Load'
	| 'Settings:Save'
	| 'Editor:Init'
	| 'Database:Init'
	| 'Database:Migration'
	| 'Transform:Text'
	| 'Dictionary:Add'
	| 'UI:DragDrop'
	| 'FileWatcher:Watch'
	| 'FileWatcher:Unwatch'
	| 'Export:PDF'
	| 'Export:HTML'
	| 'Spellcheck:Init'
	| 'Bookmark:Add'
	| 'Bookmark:Remove';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorOptions {
	/**
	 * Whether to show a toast notification to the user
	 */
	showToast?: boolean;
	/**
	 * Custom user-friendly message (if not provided, will use error message)
	 */
	userMessage?: string;
	/**
	 * Duration for the toast notification in milliseconds
	 */
	toastDuration?: number;
	/**
	 * Additional context information to log
	 */
	additionalInfo?: Record<string, any>;
	/**
	 * Error severity level
	 */
	severity?: ErrorSeverity;
	/**
	 * Whether to write to disk log (default: true)
	 */
	logToDisk?: boolean;
}

/**
 * Standardized Application Error class that handles logging, user notification, and telemetry
 */
export class AppError extends Error {
	public readonly context: ErrorContext;
	public readonly timestamp: Date;
	public readonly severity: ErrorSeverity;
	public readonly additionalInfo?: Record<string, any>;
	public readonly originalError?: Error;

	constructor(
		context: ErrorContext,
		message: string,
		options: Omit<ErrorOptions, 'userMessage'> & { originalError?: Error } = {}
	) {
		super(message);
		this.name = 'AppError';
		this.context = context;
		this.timestamp = new Date();
		this.severity = options.severity || 'error';
		this.additionalInfo = options.additionalInfo;
		this.originalError = options.originalError;

		// Capture stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, AppError);
		}
	}

	/**
	 * Create an AppError from an unknown error
	 */
	static from(
		context: ErrorContext,
		error: unknown,
		options: Omit<ErrorOptions, 'userMessage'> = {}
	): AppError {
		if (error instanceof AppError) {
			return error;
		}

		const message = error instanceof Error ? error.message : String(error);
		const originalError = error instanceof Error ? error : undefined;

		return new AppError(context, message, { ...options, originalError });
	}

	/**
	 * Handle an error: log it, show toast if needed, and return the AppError
	 */
	static handle(context: ErrorContext, error: unknown, options: ErrorOptions = {}): AppError {
		const appError = AppError.from(context, error, options);
		appError.process(options);
		return appError;
	}

	/**
	 * Process the error: log and optionally show toast
	 */
	private process(options: ErrorOptions = {}): void {
		const {
			showToast = true,
			userMessage,
			toastDuration,
			logToDisk = true
		} = options;

		// Log to console and disk
		this.logError(logToDisk);

		// Show toast notification if requested
		if (showToast) {
			const message = userMessage || this.getUserFriendlyMessage();
			const duration = toastDuration || this.getDefaultToastDuration();

			switch (this.severity) {
				case 'critical':
				case 'error':
					toastStore.error(message, duration);
					break;
				case 'warning':
					toastStore.warning(message, duration);
					break;
				case 'info':
					toastStore.info(message, duration);
					break;
			}
		}
	}

	/**
	 * Log the error to console and optionally to disk
	 */
	private async logError(toDisk: boolean): Promise<void> {
		const timestamp = this.timestamp.toISOString();
		const logMessage = `[${timestamp}] [${this.context}] ${this.message}`;

		// Console logging with appropriate level
		switch (this.severity) {
			case 'critical':
			case 'error':
				console.error(logMessage);
				break;
			case 'warning':
				console.warn(logMessage);
				break;
			case 'info':
				console.info(logMessage);
				break;
		}

		// Log additional info
		if (this.additionalInfo) {
			console.log('Additional Info:', this.additionalInfo);
		}

		// Log stack trace
		if (this.stack) {
			console.error('Stack:', this.stack);
		}
		if (this.originalError?.stack) {
			console.error('Original Stack:', this.originalError.stack);
		}

		// Write to disk log if requested
		if (toDisk) {
			try {
				const diskMessage = this.formatForDiskLog();
				await logError(diskMessage);
			} catch (e) {
				console.error('Failed to write to disk log:', e);
			}
		}
	}

	/**
	 * Format error for disk logging
	 */
	private formatForDiskLog(): string {
		const parts = [
			`[${this.context}] ${this.message}`
		];

		if (this.additionalInfo) {
			parts.push(`Additional Info: ${JSON.stringify(this.additionalInfo)}`);
		}

		if (this.originalError) {
			parts.push(`Original Error: ${this.originalError.message}`);
		}

		return parts.join(' | ');
	}

	/**
	 * Get user-friendly error message based on context and error type
	 */
	private getUserFriendlyMessage(): string {
		// File system errors
		if (this.message.includes('No such file') || this.message.includes('does not exist') || this.message.includes('not found')) {
			return this.getFileNotFoundMessage();
		}
		
		if (this.message.includes('Permission denied') || this.message.includes('Access denied')) {
			return this.getPermissionDeniedMessage();
		}

		// Context-specific messages
		switch (this.context) {
			case 'File:Read':
				return 'Failed to read file';
			case 'File:Write':
				return 'Failed to save file';
			case 'File:Metadata':
				return 'Failed to read file metadata';
			case 'Session:Save':
				return 'Failed to save session';
			case 'Session:Load':
				return 'Failed to load previous session';
			case 'Markdown:Render':
				return 'Failed to render markdown';
			case 'Settings:Save':
				return 'Failed to save settings';
			case 'Settings:Load':
				return 'Failed to load settings';
			case 'Transform:Text':
				return 'Failed to transform text';
			case 'Dictionary:Add':
				return 'Failed to add word to dictionary';
			case 'Export:PDF':
			case 'Export:HTML':
				return 'Export failed';
			case 'Bookmark:Add':
				return 'Failed to add bookmark';
			case 'Bookmark:Remove':
				return 'Failed to remove bookmark';
			default:
				return this.message || 'An error occurred';
		}
	}

	/**
	 * Get file not found message with optional filename
	 */
	private getFileNotFoundMessage(): string {
		const fileName = this.extractFileName();
		return fileName ? `File not found: ${fileName}` : 'File not found';
	}

	/**
	 * Get permission denied message with optional filename
	 */
	private getPermissionDeniedMessage(): string {
		const fileName = this.extractFileName();
		return fileName ? `Cannot access file: ${fileName}` : 'Permission denied';
	}

	/**
	 * Extract filename from additional info or error message
	 */
	private extractFileName(): string | null {
		if (this.additionalInfo?.path) {
			const path = String(this.additionalInfo.path);
			return path.split(/[\\/]/).pop() || null;
		}
		return null;
	}

	/**
	 * Get default toast duration based on severity
	 */
	private getDefaultToastDuration(): number {
		switch (this.severity) {
			case 'critical':
				return 6000;
			case 'error':
				return 4000;
			case 'warning':
				return 3000;
			case 'info':
				return 2000;
		}
	}

	/**
	 * Static method to log warnings
	 */
	static async warn(
		context: ErrorContext,
		message: string,
		options: ErrorOptions = {}
	): Promise<void> {
		const timestamp = new Date().toISOString();
		const logMessage = `[${timestamp}] [${context}] ${message}`;

		console.warn(logMessage);

		if (options.additionalInfo) {
			console.warn('Additional Info:', options.additionalInfo);
		}

		if (options.logToDisk !== false) {
			try {
				await logWarn(`[${context}] ${message}`);
			} catch (e) {
				console.error('Failed to write warning to disk log:', e);
			}
		}

		if (options.showToast) {
			toastStore.warning(
				options.userMessage || message,
				options.toastDuration || 3000
			);
		}
	}

	/**
	 * Static method to log info messages
	 */
	static async info(
		context: ErrorContext,
		message: string,
		options: ErrorOptions = {}
	): Promise<void> {
		const timestamp = new Date().toISOString();
		const logMessage = `[${timestamp}] [${context}] ${message}`;

		console.info(logMessage);

		if (options.additionalInfo) {
			console.info('Additional Info:', options.additionalInfo);
		}

		if (options.logToDisk !== false) {
			try {
				await logInfo(`[${context}] ${message}`);
			} catch (e) {
				console.error('Failed to write info to disk log:', e);
			}
		}

		if (options.showToast) {
			toastStore.info(
				options.userMessage || message,
				options.toastDuration || 2000
			);
		}
	}

	/**
	 * Create a user-friendly error message from any error
	 */
	static toUserMessage(error: unknown): string {
		if (error instanceof AppError) {
			return error.getUserFriendlyMessage();
		}
		if (error instanceof Error) {
			return error.message;
		}
		return String(error);
	}
}

/**
 * Async error boundary wrapper
 * Wraps async functions to automatically handle errors
 */
export function withErrorBoundary<T extends any[], R>(
	fn: (...args: T) => Promise<R>,
	context: ErrorContext,
	options: ErrorOptions = {}
): (...args: T) => Promise<R | null> {
	return async (...args: T): Promise<R | null> => {
		try {
			return await fn(...args);
		} catch (error) {
			AppError.handle(context, error, options);
			return null;
		}
	};
}

/**
 * Sync error boundary wrapper
 * Wraps synchronous functions to automatically handle errors
 */
export function withErrorBoundarySync<T extends any[], R>(
	fn: (...args: T) => R,
	context: ErrorContext,
	options: ErrorOptions = {}
): (...args: T) => R | null {
	return (...args: T): R | null => {
		try {
			return fn(...args);
		} catch (error) {
			AppError.handle(context, error, options);
			return null;
		}
	};
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use AppError.handle() instead
 */
export function handleFileSystemError(err: unknown, path?: string): void {
	AppError.handle('File:Read', err, {
		showToast: true,
		additionalInfo: path ? { path } : undefined
	});
}
