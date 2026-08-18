import { basename as getFilename } from './path';

export { getFilename };

export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn', 'mdtxt', 'mdtext'];

export const MARKDOWN_EXTENSION_SET = new Set(MARKDOWN_EXTENSIONS.map((ext) => ext.toLowerCase()));

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
  const filename = getFilename(path);

  // Dotfiles often text (gitignore, env, etc)
  if (filename.startsWith('.')) return true;
  if (!filename.includes('.')) return true; // No extension often implies text/script

  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) return false;
  return SUPPORTED_TEXT_EXTENSIONS.includes(extension);
}

/**
 * Check if path is a markdown file
 */
export function isMarkdownFile(path: string): boolean {
  const filename = getFilename(path);
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension ? MARKDOWN_EXTENSIONS.includes(extension) : false;
}
