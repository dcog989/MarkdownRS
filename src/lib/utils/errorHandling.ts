import { showToast } from '$lib/stores/toastStore.svelte';
import { error as logError, info as logInfo, warn as logWarn } from '@tauri-apps/plugin-log';

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
    showToast?: boolean;
    userMessage?: string;
    toastDuration?: number;
    additionalInfo?: Record<string, unknown>;
    severity?: ErrorSeverity;
    logToDisk?: boolean;
}

// Helper to truncate long strings in error logs
function safeStringify(obj: unknown): string {
    try {
        return JSON.stringify(obj, (_, value: unknown) => {
            if (typeof value === 'string' && value.length > 500) {
                return value.substring(0, 500) + '... [truncated]';
            }
            if (Array.isArray(value) && value.length > 20) {
                return [...value.slice(0, 20), `... (${value.length - 20} more items)`];
            }
            return value;
        });
    } catch {
        return '[Circular or Non-Serializable Data]';
    }
}

export class AppError extends Error {
    public readonly context: ErrorContext;
    public readonly timestamp: Date;
    public readonly severity: ErrorSeverity;
    public readonly additionalInfo?: Record<string, unknown>;
    public readonly originalError?: Error;

    constructor(
        context: ErrorContext,
        message: string,
        options: Omit<ErrorOptions, 'userMessage'> & { originalError?: Error } = {},
    ) {
        super(message);
        this.name = 'AppError';
        this.context = context;
        this.timestamp = new Date();
        this.severity = options.severity || 'error';
        this.additionalInfo = options.additionalInfo;
        this.originalError = options.originalError;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError);
        }
    }

    static from(context: ErrorContext, error: unknown, options: Omit<ErrorOptions, 'userMessage'> = {}): AppError {
        if (error instanceof AppError) {
            return error;
        }

        const message = error instanceof Error ? error.message : String(error);
        const originalError = error instanceof Error ? error : undefined;

        return new AppError(context, message, { ...options, originalError });
    }

    static handle(context: ErrorContext, error: unknown, options: ErrorOptions = {}): AppError {
        const appError = AppError.from(context, error, options);
        appError.process(options);
        return appError;
    }

    private process(options: ErrorOptions = {}): void {
        const { showToast: shouldShowToast = true, userMessage, toastDuration, logToDisk = true } = options;

        this.logError(logToDisk);

        if (shouldShowToast) {
            const message = userMessage || this.getUserFriendlyMessage();
            const duration = toastDuration || this.getDefaultToastDuration();

            switch (this.severity) {
                case 'critical':
                case 'error':
                    showToast('error', message, duration);
                    break;
                case 'warning':
                    showToast('warning', message, duration);
                    break;
                case 'info':
                    showToast('info', message, duration);
                    break;
            }
        }
    }

    private async logError(toDisk: boolean): Promise<void> {
        const timestamp = this.timestamp.toISOString();
        const logMessage = `[${timestamp}] [${this.context}] ${this.message}`;

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

        if (this.additionalInfo) {
            console.log('Additional Info:', safeStringify(this.additionalInfo));
        }

        if (this.stack) {
            console.error('Stack:', this.stack);
        }
        if (this.originalError?.stack) {
            console.error('Original Stack:', this.originalError.stack);
        }

        if (toDisk) {
            try {
                const diskMessage = this.formatForDiskLog();
                await logError(diskMessage);
            } catch (e) {
                console.error('Failed to write to disk log:', e);
            }
        }
    }

    private formatForDiskLog(): string {
        const parts = [`[${this.context}] ${this.message}`];

        if (this.additionalInfo) {
            parts.push(`Additional Info: ${safeStringify(this.additionalInfo)}`);
        }

        if (this.originalError) {
            parts.push(`Original Error: ${this.originalError.message}`);
        }

        return parts.join(' | ');
    }

    private getUserFriendlyMessage(): string {
        if (
            this.message.includes('No such file') ||
            this.message.includes('does not exist') ||
            this.message.includes('not found')
        ) {
            return this.getFileNotFoundMessage();
        }

        if (this.message.includes('Permission denied') || this.message.includes('Access denied')) {
            return this.getPermissionDeniedMessage();
        }

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

    private getFileNotFoundMessage(): string {
        const fileName = this.extractFileName();
        return fileName ? `File not found: ${fileName}` : 'File not found';
    }

    private getPermissionDeniedMessage(): string {
        const fileName = this.extractFileName();
        return fileName ? `Cannot access file: ${fileName}` : 'Permission denied';
    }

    private extractFileName(): string | null {
        if (this.additionalInfo?.path) {
            const path = String(this.additionalInfo.path);
            return path.split(/[\\/]/).pop() || null;
        }
        return null;
    }

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

    static async warn(context: ErrorContext, message: string, options: ErrorOptions = {}): Promise<void> {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${context}] ${message}`;

        console.warn(logMessage);

        if (options.additionalInfo) {
            console.warn('Additional Info:', safeStringify(options.additionalInfo));
        }

        if (options.logToDisk !== false) {
            try {
                await logWarn(`[${context}] ${message}`);
            } catch (e) {
                console.error('Failed to write warning to disk log:', e);
            }
        }

        if (options.showToast) {
            showToast('warning', options.userMessage || message, options.toastDuration || 3000);
        }
    }

    static async info(context: ErrorContext, message: string, options: ErrorOptions = {}): Promise<void> {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${context}] ${message}`;

        console.info(logMessage);

        if (options.additionalInfo) {
            console.info('Additional Info:', safeStringify(options.additionalInfo));
        }

        if (options.logToDisk !== false) {
            try {
                await logInfo(`[${context}] ${message}`);
            } catch (e) {
                console.error('Failed to write info to disk log:', e);
            }
        }

        if (options.showToast) {
            showToast('info', options.userMessage || message, options.toastDuration || 2000);
        }
    }

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

export function withErrorBoundary<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    context: ErrorContext,
    options: ErrorOptions = {},
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

export function withErrorBoundarySync<T extends unknown[], R>(
    fn: (...args: T) => R,
    context: ErrorContext,
    options: ErrorOptions = {},
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

export function handleFileSystemError(err: unknown, path?: string): void {
    AppError.handle('File:Read', err, {
        showToast: true,
        additionalInfo: path ? { path } : undefined,
    });
}
