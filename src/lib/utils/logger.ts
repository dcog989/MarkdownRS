import { debug, error, info, warn } from '@tauri-apps/plugin-log';

/**
 * Frontend Logging Utility
 *
 * Provides structured logging following the Namespace-Action-Metadata pattern.
 * All logs follow: [Namespace] Action | key=value | key=value
 *
 * Namespaces:
 * - [Editor] - Lifecycle events (tab switches, content updates, initialization)
 * - [Session] - Session persistence operations
 * - [File] - File I/O operations
 * - [Bridge] - IPC calls (handled automatically by backend.ts)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMetadata {
    [key: string]: string | number | boolean | undefined | null;
}

class Logger {
    private formatMetadata(metadata?: LogMetadata): string {
        if (!metadata) return '';

        return Object.entries(metadata)
            .filter(([_, value]) => value !== undefined && value !== null)
            .map(([key, value]) => {
                // Truncate long strings
                if (typeof value === 'string' && value.length > 100) {
                    return `${key}=${value.substring(0, 100)}...`;
                }
                return `${key}=${value}`;
            })
            .join(' | ');
    }

    private log(level: LogLevel, namespace: string, action: string, metadata?: LogMetadata): void {
        const metadataStr = this.formatMetadata(metadata);
        const message = metadataStr ? `[${namespace}] ${action} | ${metadataStr}` : `[${namespace}] ${action}`;

        // 1. Output to Browser Console (Standard)
        switch (level) {
            case 'debug':
                console.debug(message);
                break;
            case 'info':
                console.info(message);
                break;
            case 'warn':
                console.warn(message);
                break;
            case 'error':
                console.error(message);
                break;
        }

        // 2. Forward to Backend Logger (Disk + Terminal)
        // Fire-and-forget to avoid awaiting IPC calls during UI rendering
        switch (level) {
            case 'debug':
                debug(message).catch(() => {});
                break;
            case 'info':
                info(message).catch(() => {});
                break;
            case 'warn':
                warn(message).catch(() => {});
                break;
            case 'error':
                error(message).catch(() => {});
                break;
        }
    }

    // Editor namespace
    editor = {
        debug: (action: string, metadata?: LogMetadata) => this.log('debug', 'Editor', action, metadata),
        info: (action: string, metadata?: LogMetadata) => this.log('info', 'Editor', action, metadata),
        warn: (action: string, metadata?: LogMetadata) => this.log('warn', 'Editor', action, metadata),
        error: (action: string, metadata?: LogMetadata) => this.log('error', 'Editor', action, metadata),
    };

    // Session namespace
    session = {
        debug: (action: string, metadata?: LogMetadata) => this.log('debug', 'Session', action, metadata),
        info: (action: string, metadata?: LogMetadata) => this.log('info', 'Session', action, metadata),
        warn: (action: string, metadata?: LogMetadata) => this.log('warn', 'Session', action, metadata),
        error: (action: string, metadata?: LogMetadata) => this.log('error', 'Session', action, metadata),
    };

    // File namespace
    file = {
        debug: (action: string, metadata?: LogMetadata) => this.log('debug', 'File', action, metadata),
        info: (action: string, metadata?: LogMetadata) => this.log('info', 'File', action, metadata),
        warn: (action: string, metadata?: LogMetadata) => this.log('warn', 'File', action, metadata),
        error: (action: string, metadata?: LogMetadata) => this.log('error', 'File', action, metadata),
    };

    // Performance timing helper
    startTimer(namespace: string, action: string): () => void {
        const start = performance.now();
        return (metadata?: LogMetadata) => {
            const duration = (performance.now() - start).toFixed(2);
            this.log('info', namespace, action, { ...metadata, duration: `${duration}ms` });
        };
    }
}

export const logger = new Logger();
