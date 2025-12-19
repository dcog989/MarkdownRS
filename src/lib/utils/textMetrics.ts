import { invoke } from '@tauri-apps/api/core';

export interface TextMetrics {
    lineCount: number;
    wordCount: number;
    charCount: number;
}

export interface CursorMetrics extends TextMetrics {
    cursorLine: number;
    cursorCol: number;
    currentLineLength: number;
    currentWordIndex: number;
}

/**
 * Calculate text metrics using Rust backend.
 * Best used for initial file loads or large files.
 */
export async function calculateTextMetrics(content: string): Promise<TextMetrics> {
    try {
        const result = await invoke<{
            line_count: number;
            word_count: number;
            char_count: number;
        }>('calculate_text_metrics_command', { content });
        
        return {
            lineCount: result.line_count,
            wordCount: result.word_count,
            charCount: result.char_count,
        };
    } catch (e) {
        console.error('[TextMetrics] Error calculating metrics:', e);
        // Fallback to basic calculation
        return {
            lineCount: content.split('\n').length,
            wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
            charCount: content.length,
        };
    }
}

/**
 * Calculate metrics including cursor position using Rust backend.
 * Best used for initial loads or large documents.
 */
export async function calculateCursorMetrics(
    content: string,
    cursorOffset: number
): Promise<CursorMetrics> {
    try {
        const result = await invoke<{
            line_count: number;
            word_count: number;
            char_count: number;
            cursor_line: number;
            cursor_col: number;
            current_line_length: number;
            current_word_index: number;
        }>('calculate_cursor_metrics_command', { content, cursorOffset });
        
        return {
            lineCount: result.line_count,
            wordCount: result.word_count,
            charCount: result.char_count,
            cursorLine: result.cursor_line,
            cursorCol: result.cursor_col,
            currentLineLength: result.current_line_length,
            currentWordIndex: result.current_word_index,
        };
    } catch (e) {
        console.error('[TextMetrics] Error calculating cursor metrics:', e);
        // Fallback
        const basicMetrics = await calculateTextMetrics(content);
        return {
            ...basicMetrics,
            cursorLine: 1,
            cursorCol: 1,
            currentLineLength: 0,
            currentWordIndex: 0,
        };
    }
}

/**
 * Determine if we should use Rust for metrics calculation.
 * Use Rust for large files (> 50KB or > 1000 lines)
 */
export function shouldUseRustMetrics(content: string): boolean {
    const size = content.length;
    const lineCount = content.split('\n').length;
    
    return size > 50000 || lineCount > 1000;
}
