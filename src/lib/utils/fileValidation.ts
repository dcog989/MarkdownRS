/**
 * File validation utilities
 */

export interface FileValidationOptions {
    maxSizeBytes?: number;
    allowedExtensions?: string[];
    requireExtension?: boolean;
}

export interface FileValidationResult {
    valid: boolean;
    error?: string;
}

const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DEFAULT_ALLOWED_EXTENSIONS = ['md', 'markdown', 'txt', 'rs', 'js', 'ts', 'svelte', 'json'];

/**
 * Validate file path and size
 */
export function validateFile(
    path: string,
    sizeBytes: number,
    options: FileValidationOptions = {}
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

    // Check for parent directory references
    if (path.includes('..')) {
        return { valid: false, error: 'Invalid path: contains parent directory references' };
    }

    // Check file size
    if (sizeBytes > maxSizeBytes) {
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
        const maxMB = (maxSizeBytes / (1024 * 1024)).toFixed(0);
        return { 
            valid: false, 
            error: `File too large: ${sizeMB} MB (maximum ${maxMB} MB)` 
        };
    }

    // Check file extension
    const extension = path.split('.').pop()?.toLowerCase();
    
    if (requireExtension && !extension) {
        return { valid: false, error: 'File must have an extension' };
    }

    if (extension && !allowedExtensions.includes(extension)) {
        return { 
            valid: false, 
            error: `Unsupported file type: .${extension}` 
        };
    }

    return { valid: true };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Check if path is likely a text file based on extension
 */
export function isTextFile(path: string): boolean {
    const extension = path.split('.').pop();
    if (!extension) return false;
    return DEFAULT_ALLOWED_EXTENSIONS.includes(extension.toLowerCase());
}
