import { translate } from "$lib/i18n";
import { showToast } from "$lib/stores/toastStore.svelte";
import { getFilename } from "./fileValidation";
import { logger } from "./logger";

export type ErrorContext =
  | "Session:Save"
  | "Session:Load"
  | "File:Read"
  | "File:Write"
  | "File:Metadata"
  | "File:ListDirectory"
  | "File:StatDirectory"
  | "Markdown:Render"
  | "Settings:Load"
  | "Settings:Save"
  | "Settings:AppInfo"
  | "Editor:Init"
  | "Editor:ImagePaste"
  | "Database:Init"
  | "Transform:Text"
  | "Dictionary:Add"
  | "UI:DragDrop"
  | "FileWatcher:Watch"
  | "FileWatcher:Unwatch"
  | "Export:PDF"
  | "Export:HTML"
  | "Export:Document"
  | "Spellcheck:Init"
  | "Spellcheck:Suggest"
  | "Bookmark:Add"
  | "Bookmark:Remove"
  | "Markdown:TOC"
  | "Update:Check"
  | "Update:Install"
  | "Markdown:Lint"
  | "Markdown:ReadRumdlConfig"
  | "Markdown:WriteRumdlConfig"
  | "Data:ExportBookmarks"
  | "Data:ImportBookmarks"
  | "Data:ExportFileHistory"
  | "Data:ImportFileHistory"
  | "Data:ClearFileHistory"
  | "Data:DeleteOrphans";

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export interface ErrorOptions {
  showToast?: boolean;
  userMessage?: string;
  toastDuration?: number;
  additionalInfo?: Record<string, unknown>;
  severity?: ErrorSeverity;
  logToDisk?: boolean;
  /** Set for errors already logged by the Rust backend, to avoid a duplicate disk entry. */
  fromBackend?: boolean;
}

// Helper to truncate long strings in error logs
function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, (_, value: unknown) => {
      if (typeof value === "string" && value.length > 500) {
        return `${value.substring(0, 500)}... [truncated]`;
      }
      if (Array.isArray(value) && value.length > 20) {
        return [...value.slice(0, 20), `... (${value.length - 20} more items)`];
      }
      return value;
    });
  } catch (e) {
    return `[safeStringify Error: ${(e as Error).message}]`;
  }
}

export class AppError extends Error {
  public readonly context: ErrorContext;
  public readonly severity: ErrorSeverity;
  public readonly additionalInfo?: Record<string, unknown>;
  public readonly originalError?: Error;
  public readonly fromBackend: boolean;

  constructor(
    context: ErrorContext,
    message: string,
    options: Omit<ErrorOptions, "userMessage"> & { originalError?: Error } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.context = context;
    this.severity = options.severity || "error";
    this.additionalInfo = options.additionalInfo;
    this.originalError = options.originalError;
    this.fromBackend = options.fromBackend ?? false;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  static from(context: ErrorContext, error: unknown, options: Omit<ErrorOptions, "userMessage"> = {}): AppError {
    if (error instanceof AppError) {
      // Keep the original message but let the caller add its own context and
      // details (e.g. the command and path that failed).
      return new AppError(context, error.message, {
        severity: options.severity ?? error.severity,
        additionalInfo:
          options.additionalInfo || error.additionalInfo
            ? { ...(error.additionalInfo ?? {}), ...(options.additionalInfo ?? {}) }
            : undefined,
        fromBackend: options.fromBackend ?? error.fromBackend,
        originalError: error.originalError,
      });
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

    // Log once. Backend command errors are already written by Rust, so only
    // frontend-originated errors are written here.
    if (logToDisk && !this.fromBackend) {
      const level = this.severity === "info" ? "info" : this.severity === "warning" ? "warn" : "error";
      logger.app[level](this.formatForDiskLog());
    }

    if (shouldShowToast) {
      const message = userMessage || this.getUserFriendlyMessage();
      const duration = toastDuration || this.getDefaultToastDuration();

      switch (this.severity) {
        case "critical":
        case "error":
          showToast("error", message, duration);
          break;
        case "warning":
          showToast("warning", message, duration);
          break;
        case "info":
          showToast("info", message, duration);
          break;
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

    return parts.join(" | ");
  }

  private getUserFriendlyMessage(): string {
    // Stable codes from `handle_io_error`; OS error text is localized and
    // cannot be matched here.
    if (this.message.includes("NOT_FOUND")) {
      return this.getFileNotFoundMessage();
    }

    if (this.message.includes("PERMISSION_DENIED")) {
      return this.getPermissionDeniedMessage();
    }

    const message = this.message.toLowerCase();

    if (message.includes("no such file") || message.includes("does not exist")) {
      return this.getFileNotFoundMessage();
    }

    if (message.includes("permission denied") || message.includes("access denied")) {
      return this.getPermissionDeniedMessage();
    }

    switch (this.context) {
      case "File:Read":
        return translate("error.failedToRead");
      case "File:Write":
        return this.message && this.message !== "Failed to save file"
          ? translate("error.failedToSaveDetailed", { values: { detail: this.message } })
          : translate("error.failedToSave");
      case "File:Metadata":
        return translate("error.failedToReadMetadata");
      case "Session:Save":
        return translate("error.failedToSaveSession");
      case "Session:Load":
        return translate("error.failedToLoadSession");
      case "Markdown:Render":
        return translate("error.failedToRenderMarkdown");
      case "Settings:Save":
        return translate("error.failedToSaveSettings");
      case "Settings:Load":
        return translate("error.failedToLoadSettings");
      case "Transform:Text":
        return translate("error.failedToTransform");
      case "Dictionary:Add":
        return translate("error.failedToAddWord");
      case "Export:PDF":
      case "Export:HTML":
        return translate("error.exportFailed");
      case "Bookmark:Add":
        return translate("error.failedToAddBookmark");
      case "Bookmark:Remove":
        return translate("error.failedToRemoveBookmark");
      default:
        return this.message || translate("error.generic");
    }
  }

  private getFileNotFoundMessage(): string {
    const fileName = this.extractFileName();
    return fileName
      ? translate("error.fileNotFoundNamed", { values: { name: fileName } })
      : translate("error.fileNotFound");
  }

  private getPermissionDeniedMessage(): string {
    const fileName = this.extractFileName();
    return fileName
      ? translate("error.cannotAccess", { values: { name: fileName } })
      : translate("error.permissionDenied");
  }

  private extractFileName(): string | null {
    if (this.additionalInfo?.path) {
      const path = String(this.additionalInfo.path);
      return getFilename(path) || null;
    }
    return null;
  }

  private getDefaultToastDuration(): number {
    switch (this.severity) {
      case "critical":
        return 6000;
      case "error":
        return 4000;
      case "warning":
        return 3000;
      case "info":
        return 2000;
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
