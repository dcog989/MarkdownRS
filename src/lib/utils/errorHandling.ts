/**
 * Centralized error handling and logging utilities
 */

export type ErrorContext = 
    | 'Session:Save'
    | 'Session:Load'
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
    | 'Dictionary:Add';

/**
 * Centralized error logger with consistent formatting
 */
export class AppError {
    /**
     * Log an error with context information
     * @param context - The context where the error occurred
     * @param error - The error object or message
     * @param additionalInfo - Optional additional information
     */
    static log(context: ErrorContext, error: unknown, additionalInfo?: Record<string, any>): void {
        const message = error instanceof Error ? error.message : String(error);
        const timestamp = new Date().toISOString();
        
        console.error(`[${timestamp}] [${context}]`, message);
        
        if (additionalInfo) {
            console.error('Additional Info:', additionalInfo);
        }
        
        if (error instanceof Error && error.stack) {
            console.error('Stack:', error.stack);
        }
    }
    
    /**
     * Log a warning with context
     * @param context - The context where the warning occurred
     * @param message - The warning message
     */
    static warn(context: ErrorContext, message: string): void {
        const timestamp = new Date().toISOString();
        console.warn(`[${timestamp}] [${context}]`, message);
    }
    
    /**
     * Log info message with context
     * @param context - The context for the info message
     * @param message - The info message
     */
    static info(context: ErrorContext, message: string): void {
        const timestamp = new Date().toISOString();
        console.info(`[${timestamp}] [${context}]`, message);
    }
    
    /**
     * Create a user-friendly error message
     * @param error - The error to format
     * @returns A user-friendly error message
     */
    static toUserMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}
