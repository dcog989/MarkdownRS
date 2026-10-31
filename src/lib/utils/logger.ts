import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend Logging Utility
 *
 * Provides structured logging with a batching mechanism to minimize IPC overhead.
 * Logs are collected and sent to the backend every 500ms or when the buffer is full.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Send a single log record to the backend, bypassing the batching buffer.
 * Uses `invoke` directly to avoid recursing through `callBackend` error handling.
 */
export async function logToBackend(level: LogLevel, message: string): Promise<void> {
  try {
    await invoke("log_frontend", { level, message });
  } catch (e) {
    console.error("[Logger] Backend log failed:", e);
  }
}

interface LogMetadata {
  [key: string]: string | number | boolean | undefined | null;
}

class Logger {
  private buffer: { level: LogLevel; message: string }[] = [];
  private flushTimer: number | null = null;
  private readonly MAX_BUFFER_SIZE = 50;
  private readonly FLUSH_INTERVAL_MS = 500;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.flush());
    }
  }

  private formatMetadata(metadata?: LogMetadata): string {
    if (!metadata) return "";

    return Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        if (typeof value === "string" && value.length > 100) {
          return `${key}=${value.substring(0, 100)}...`;
        }
        return `${key}=${value}`;
      })
      .join(" | ");
  }

  private log(level: LogLevel, namespace: string, action: string, metadata?: LogMetadata): void {
    const metadataStr = this.formatMetadata(metadata);
    const message = metadataStr ? `[${namespace}] ${action} | ${metadataStr}` : `[${namespace}] ${action}`;

    // In development, log to console immediately for real-time visibility
    if (import.meta.env.DEV) {
      const fn =
        level === "debug"
          ? console.debug
          : level === "info"
            ? console.info
            : level === "warn"
              ? console.warn
              : console.error;
      fn(`[Logger/${level.toUpperCase()}] ${message}`);
    }

    // Buffer for Backend Logger
    this.buffer.push({ level, message });

    // Errors flush now: the app can quit before the 500 ms timer fires, and an
    // error log is exactly the one worth keeping.
    if (level === "error" || this.buffer.length >= this.MAX_BUFFER_SIZE) {
      void this.flush();
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
      const combined = messages.join("\n");
      await logToBackend(level as LogLevel, combined);
    }
  }

  private ns(name: string) {
    return {
      debug: (action: string, metadata?: LogMetadata) => this.log("debug", name, action, metadata),
      info: (action: string, metadata?: LogMetadata) => this.log("info", name, action, metadata),
      warn: (action: string, metadata?: LogMetadata) => this.log("warn", name, action, metadata),
      error: (action: string, metadata?: LogMetadata) => this.log("error", name, action, metadata),
    };
  }

  editor = this.ns("Editor");
  session = this.ns("Session");
  file = this.ns("File");
  spellcheck = this.ns("Spellcheck");
  app = this.ns("App");
}

export const logger = new Logger();
