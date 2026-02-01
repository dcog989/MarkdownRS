/**
 * File validation utilities
 */

import { CONFIG } from './config';

export interface FileValidationOptions {
    maxSizeBytes?: number;
    allowedExtensions?: string[];
    requireExtension?: boolean;
}

export interface FileValidationResult {
    valid: boolean;
    error?: string;
}

/** Default max file size in bytes from centralized config (50 MB) */
const DEFAULT_MAX_FILE_SIZE = CONFIG.EDITOR.MAX_FILE_SIZE_MB * 1024 * 1024;

export const MARKDOWN_EXTENSIONS = [
    'md',
    'markdown',
    'mdown',
    'mkdn',
    'mkd',
    'mdwn',
    'mdtxt',
    'mdtext',
];

export const SUPPORTED_TEXT_EXTENSIONS = [
    // Markdown & Text
    ...MARKDOWN_EXTENSIONS,
    'txt',
    'log',
    'asc',
    'adoc',
    // Web
    'html',
    'htm',
    'css',
    'scss',
    'less',
    'js',
    'jsx',
    'ts',
    'tsx',
    'svelte',
    'vue',
    'json',
    // Config
    'yaml',
    'yml',
    'toml',
    'ini',
    'cfg',
    'conf',
    'properties',
    'env',
    'gitignore',
    // Code
    'rs',
    'py',
    'rb',
    'php',
    'pl',
    'go',
    'java',
    'c',
    'cpp',
    'h',
    'hpp',
    'cs',
    'swift',
    'kt',
    'kts',
    'sh',
    'bash',
    'zsh',
    'bat',
    'cmd',
    'ps1',
    'lua',
    'sql',
    // Data/Misc
    'xml',
    'svg',
    'diff',
    'patch',
    'csv',
    'tsv',
];

const DEFAULT_ALLOWED_EXTENSIONS = SUPPORTED_TEXT_EXTENSIONS;

/**
 * Validate file path and size
 */
export function validateFile(
    path: string,
    sizeBytes: number,
    options: FileValidationOptions = {},
): FileValidationResult {
    const {
        maxSizeBytes = DEFAULT_MAX_FILE_SIZE,
        allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
        requireExtension = false,
    } = options;

    // Check for null bytes
    if (path.includes('\0')) {
        return { valid: false, error: 'Invalid path: contains null bytes' };
    }

    // Check for problematic directory traversal patterns
    // Normalize path and check for suspicious patterns that could be attacks
    // Allow legitimate relative paths like "../config.json" but block "../../../etc/passwd"
    const normalizedPath = path.replace(/\\/g, '/');
    const parentDirCount = (normalizedPath.match(/\.\.\//g) || []).length;

    // Block excessive parent directory traversal (more than 3 levels up)
    if (parentDirCount > 3) {
        return {
            valid: false,
            error: 'Invalid path: excessive directory traversal',
        };
    }

    // Block patterns that try to escape using various encodings
    if (/\.\.%2e|%2e%2e|%252e/i.test(path)) {
        return {
            valid: false,
            error: 'Invalid path: contains encoded directory traversal',
        };
    }

    // Check file size
    if (sizeBytes > maxSizeBytes) {
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
        const maxMB = (maxSizeBytes / (1024 * 1024)).toFixed(0);
        return {
            valid: false,
            error: `File too large: ${sizeMB} MB (maximum ${maxMB} MB)`,
        };
    }

    // Check file extension
    const parts = path.split(/[\\/]/);
    const filename = parts.pop() || '';

    // Dotfiles (like .gitignore) are considered valid if they match a known type or generally
    if (filename.startsWith('.') && filename.length > 1) {
        return { valid: true };
    }

    const extension = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : null;

    if (requireExtension && !extension) {
        return { valid: false, error: 'File must have an extension' };
    }

    if (extension && !allowedExtensions.includes(extension)) {
        return {
            valid: false,
            error: `Unsupported file type: .${extension}`,
        };
    }

    return { valid: true };
}

/**
 * Format file size for display with smart rounding:
 * - Below 1 KB: round up to nearest tenth (e.g., 0.1 KB, 0.5 KB)
 * - From 1 KB to < 1 MB: round up to whole KB (e.g., 15 KB, 500 KB)
 * - MB and above: round up to nearest tenth (e.g., 1.5 MB, 2.3 GB)
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 KB';

    const kb = bytes / 1024;

    // MB range and above
    if (kb >= 1024) {
        const mb = kb / 1024;
        if (mb >= 1024) {
            // GB range - round up to nearest tenth
            return `${Math.ceil(mb / 102.4) / 10} GB`;
        }
        // MB range - round up to nearest tenth
        return `${Math.ceil(mb * 10) / 10} MB`;
    }

    // Below 1 KB - round up to nearest tenth
    if (kb < 1) {
        const rounded = Math.ceil(kb * 10) / 10;
        return `${rounded} KB`;
    }

    // From 1 KB to < 1 MB - round up to whole KB
    return `${Math.ceil(kb)} KB`;
}

/**
 * Check if path is likely a text file based on extension
 */
export function isTextFile(path: string): boolean {
    const parts = path.split(/[\\/]/);
    const filename = parts.pop() || '';

    // Dotfiles often text (gitignore, env, etc)
    if (filename.startsWith('.')) return true;
    if (!filename.includes('.')) return true; // No extension often implies text/script

    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension) return false;
    return DEFAULT_ALLOWED_EXTENSIONS.includes(extension);
}

/**
 * Check if path is a markdown file
 */
export function isMarkdownFile(path: string): boolean {
    const parts = path.split(/[\\/]/);
    const filename = parts.pop() || '';

    // Assume files without extensions (e.g. "New-1") are markdown
    if (!filename.includes('.')) return true;

    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? MARKDOWN_EXTENSIONS.includes(extension) : false;
}
