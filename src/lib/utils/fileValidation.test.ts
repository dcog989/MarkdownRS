import { describe, expect, it } from 'vitest';
import { formatFileSize, getFilename, isMarkdownFile, isTextFile } from './fileValidation';

describe('getFilename', () => {
  it('extracts the trailing path segment on both separators', () => {
    expect(getFilename('/home/user/doc.md')).toBe('doc.md');
    expect(getFilename('C:\\Docs\\notes.txt')).toBe('notes.txt');
    expect(getFilename('doc.md')).toBe('doc.md');
  });

  it('returns an empty string for a trailing separator', () => {
    expect(getFilename('/home/user/')).toBe('');
  });
});

describe('formatFileSize', () => {
  it('returns 0 KB for zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 KB');
  });

  it('rounds up to tenths below 1 KB', () => {
    expect(formatFileSize(1)).toBe('0.1 KB');
    expect(formatFileSize(512)).toBe('0.5 KB');
  });

  it('rounds up to whole KB from 1 KB to < 1 MB', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1500)).toBe('2 KB');
  });

  it('rounds up to tenths for MB and GB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(1024 * 1024 * 1536)).toBe('1.5 GB');
  });
});

describe('isTextFile', () => {
  it('accepts supported text extensions case-insensitively', () => {
    expect(isTextFile('notes.md')).toBe(true);
    expect(isTextFile('main.rs')).toBe(true);
    expect(isTextFile('README.MD')).toBe(true);
    expect(isTextFile('config.json')).toBe(true);
  });

  it('accepts dotfiles and extensionless files', () => {
    expect(isTextFile('/home/user/.gitignore')).toBe(true);
    expect(isTextFile('/home/user/Makefile')).toBe(true);
  });

  it('rejects binary extensions', () => {
    expect(isTextFile('image.png')).toBe(false);
    expect(isTextFile('archive.zip')).toBe(false);
  });
});

describe('isMarkdownFile', () => {
  it('accepts markdown extensions', () => {
    expect(isMarkdownFile('a.md')).toBe(true);
    expect(isMarkdownFile('a.markdown')).toBe(true);
    expect(isMarkdownFile('a.mkd')).toBe(true);
  });

  it('rejects extensionless files', () => {
    expect(isMarkdownFile('New-1')).toBe(false);
    expect(isMarkdownFile('Makefile')).toBe(false);
  });

  it('rejects non-markdown extensions', () => {
    expect(isMarkdownFile('a.txt')).toBe(false);
    expect(isMarkdownFile('a.md.js')).toBe(false);
  });
});
