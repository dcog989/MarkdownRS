import { debug, error, info, warn } from '@tauri-apps/plugin-log';

/**
 * Frontend Logging Utility
 *
 * Provides structured logging with a batching mechanism to minimize IPC overhead.
 * Logs are collected and sent to the backend every 500ms or when the buffer is full.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMetadata {
    [key: string]: string | number | boolean | undefined | null;
}

class Logger {
    private buffer: { level: LogLevel; message: string }[] = [];
    private flushTimer: number | null = null;
    private readonly MAX_BUFFER_SIZE = 50;
    private readonly FLUSH_INTERVAL_MS = 500;

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => this.flush());
        }
    }

    private formatMetadata(metadata?: LogMetadata): string {
        if (!metadata) return '';

        return Object.entries(metadata)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => {
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

        // Standard Browser Console output
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

        // Buffer for Backend Logger
        this.buffer.push({ level, message });

        if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
            this.flush();
        } else if (!this.flushTimer) {
            this.flushTimer = window.setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
        }
    }

    private async flush(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        if (this.buffer.length === 0) return;

        const currentBuffer = [...this.buffer];
        this.buffer = [];

        // Group by level to send combined messages per level
        const grouped = currentBuffer.reduce(
            (acc, { level, message }) => {
                if (!acc[level]) acc[level] = [];
                acc[level].push(message);
                return acc;
            },
            {} as Record<LogLevel, string[]>,
        );

        for (const [level, messages] of Object.entries(grouped)) {
            const combined = messages.join('\n');
            try {
                switch (level as LogLevel) {
                    case 'debug':
                        await debug(combined);
                        break;
                    case 'info':
                        await info(combined);
                        break;
                    case 'warn':
                        await warn(combined);
                        break;
                    case 'error':
                        await error(combined);
                        break;
                }
            } catch (e) {
                console.error('[Logger] Batch flush failed:', e);
            }
        }
    }

    editor = {
        debug: (action: string, metadata?: LogMetadata) => this.log('debug', 'Editor', action, metadata),
        info: (action: string, metadata?: LogMetadata) => this.log('info', 'Editor', action, metadata),
        warn: (action: string, metadata?: LogMetadata) => this.log('warn', 'Editor', action, metadata),
        error: (action: string, metadata?: LogMetadata) => this.log('error', 'Editor', action, metadata),
    };

    session = {
        debug: (action: string, metadata?: LogMetadata) => this.log('debug', 'Session', action, metadata),
        info: (action: string, metadata?: LogMetadata) => this.log('info', 'Session', action, metadata),
        warn: (action: string, metadata?: LogMetadata) => this.log('warn', 'Session', action, metadata),
        error: (action: string, metadata?: LogMetadata) => this.log('error', 'Session', action, metadata),
    };

    file = {
        debug: (action: string, metadata?: LogMetadata) => this.log('debug', 'File', action, metadata),
        info: (action: string, metadata?: LogMetadata) => this.log('info', 'File', action, metadata),
        warn: (action: string, metadata?: LogMetadata) => this.log('warn', 'File', action, metadata),
        error: (action: string, metadata?: LogMetadata) => this.log('error', 'File', action, metadata),
    };

    startTimer(namespace: string, action: string): () => void {
        const start = performance.now();
        return (metadata?: LogMetadata) => {
            const duration = (performance.now() - start).toFixed(2);
            this.log('info', namespace, action, { ...metadata, duration: `${duration}ms` });
        };
    }
}

export const logger = new Logger();
