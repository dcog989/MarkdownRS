import { EditorSelection, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Image } from '@tauri-apps/api/image';
import { readImage, readText } from '@tauri-apps/plugin-clipboard-manager';
import { readFile } from '@tauri-apps/plugin-fs';
import { translate } from '$lib/i18n';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { AppError } from '$lib/utils/errorHandling';
import type { AppEditorView } from '../../global';

const IMAGE_ASSET_DIR = 'assets';
const MAX_NAME_DEDUPE_ATTEMPTS = 99;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);

let pasteQueue: Promise<unknown> = Promise.resolve();

function serializedPaste<T>(op: () => Promise<T>): Promise<T> {
  const run = pasteQueue.then(op, op);
  pasteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function createImagePasteExtension() {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      event.preventDefault();
      pasteFromClipboard(view).catch((err) => {
        AppError.handle('Editor:ImagePaste', err, {
          showToast: true,
          userMessage: translate('editor.imagePasteFailed'),
          severity: 'error',
        });
      });
      return true;
    },
  });
}

export async function pasteFromClipboard(view: EditorView): Promise<void> {
  let image: Image | null = null;
  try {
    image = await readImage();
  } catch {
    // Clipboard has no image; fall back to text below.
  }

  if (image) {
    const tabPath = getActiveTabPath(view);
    if (!tabPath) {
      const text = await safeReadText();
      if (text.length > 0) {
        dispatchPastedText(view, text);
        return;
      }
      showToast('error', translate('editor.imagePasteSaveFirst'));
      return;
    }

    try {
      const saved = await savePastedImage(tabPath, image);
      if (saved) insertImageMarkdown(view, saved.relativeRef);
    } catch (err) {
      AppError.handle('Editor:ImagePaste', err, {
        showToast: true,
        userMessage: translate('editor.imagePasteFailed'),
        severity: 'error',
      });
    }
    return;
  }

  const text = await safeReadText();
  if (text.length > 0) {
    if (await tryImportImageFile(view, text)) return;
    dispatchPastedText(view, text);
    return;
  }
  AppError.handle('Editor:ImagePaste', new Error('Clipboard has neither text nor an image'), {
    showToast: true,
    userMessage: translate('editor.imagePasteFailed'),
    severity: 'error',
  });
}

async function safeReadText(): Promise<string> {
  try {
    return await readText();
  } catch {
    return '';
  }
}

/**
 * Handles the case where the clipboard holds a reference to an existing image
 * file (e.g. copying a file in the OS file manager pastes a `file://` URI)
 * instead of an image bitmap: imports a copy of that file into the note's
 * assets folder and inserts a relative markdown reference.
 */
async function tryImportImageFile(view: EditorView, rawText: string): Promise<boolean> {
  try {
    return await importImageFileChecked(view, rawText);
  } catch (err) {
    AppError.handle('Editor:ImagePaste', err, {
      showToast: true,
      userMessage: translate('editor.imagePasteFailed'),
      severity: 'error',
    });
    return true;
  }
}

async function importImageFileChecked(view: EditorView, rawText: string): Promise<boolean> {
  const firstLine = rawText.split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine) return false;

  const sourcePath = extractImagePath(firstLine);
  if (!sourcePath) return false;

  const tabPath = getActiveTabPath(view);
  if (!tabPath) {
    showToast('error', translate('editor.imagePasteSaveFirst'));
    return true;
  }

  const meta = await callBackend('path_exists', { path: sourcePath }, 'File:Metadata', undefined, {
    ignore: true,
  });
  if (!meta) {
    showToast('error', translate('editor.imagePasteFileNotFound', { values: { path: sourcePath } }));
    return true;
  }

  const normalizedPath = tabPath.replace(/\\/g, '/');
  const directory = normalizedPath.replace(/[\\/][^\\/]+$/, '');
  const bytes = await readFile(sourcePath);
  let targetPath: string;
  try {
    targetPath = await serializedPaste(async () => {
      const sourceName = sanitizeFileName(sourcePath.replace(/\\/g, '/').split('/').pop() ?? 'image');
      const name = await uniqueFileName(directory, sourceName);
      await callBackend('write_binary_file', { path: name, content: Array.from(bytes) }, 'File:Write');
      return name;
    });
  } catch (err) {
    AppError.handle('Editor:ImagePaste', err, {
      showToast: true,
      userMessage: translate('editor.imagePasteFailed'),
      severity: 'error',
    });
    return true;
  }

  const relativeRef = targetPath.slice(directory.length + 1).replace(/\\/g, '/');
  insertImageMarkdown(view, relativeRef);
  return true;
}

function sanitizeFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const clean = stem
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${clean || 'image'}${ext.toLowerCase()}`;
}

function extractImagePath(text: string): string | null {
  const ext = text.split(/[.?#]/).pop()?.toLowerCase() ?? '';
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  if (/^file:\/\//i.test(text)) {
    try {
      const pathname = decodeURIComponent(new URL(text).pathname);
      return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
    } catch {
      return null;
    }
  }

  if (/^(?:[A-Za-z]:[\\/]|\/)/.test(text)) return text;
  return null;
}

function getActiveTabPath(view: EditorView): string | undefined {
  const tabId = (view as AppEditorView)._currentTabId;
  if (!tabId) return undefined;
  const tab = appContext.editor.tabs.find((t) => t.id === tabId);
  return tab?.path ?? undefined;
}

async function savePastedImage(
  tabPath: string,
  image: Image,
): Promise<{ absolutePath: string; relativeRef: string } | null> {
  const normalizedPath = tabPath.replace(/\\/g, '/');
  const directory = normalizedPath.replace(/[\\/][^\\/]+$/, '');
  const bytes = await imageToPngBytes(image);

  let fileName: string;
  try {
    fileName = await serializedPaste(async () => {
      const name = await uniqueFileName(directory, buildFileName(normalizedPath));
      await callBackend('write_binary_file', { path: name, content: Array.from(bytes) }, 'File:Write');
      return name;
    });
  } catch (err) {
    AppError.handle('Editor:ImagePaste', err, {
      showToast: true,
      userMessage: translate('editor.imagePasteFailed'),
      severity: 'error',
    });
    return null;
  }

  const relativeRef = fileName.slice(directory.length + 1).replace(/\\/g, '/');
  return { absolutePath: fileName, relativeRef };
}

function buildFileName(markdownPath: string): string {
  const baseName = markdownPath.split('/').pop() ?? '';
  const stem = (baseName.split('.').slice(0, -1).join('.') || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const prefix = stem ? `${stem}-` : '';
  return `${prefix}${formatTimestamp()}.png`;
}

function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function uniqueFileName(directory: string, baseFileName: string): Promise<string> {
  const assetDir = `${directory}/${IMAGE_ASSET_DIR}`;
  try {
    await callBackend('ensure_dir', { path: assetDir }, 'File:Write', undefined, { ignore: true });
  } catch {
    // Directory creation is best-effort; write_binary_file surfaces real errors.
  }

  for (let i = 0; i < MAX_NAME_DEDUPE_ATTEMPTS; i++) {
    const candidateName = i === 0 ? baseFileName : baseFileName.replace(/\.([a-z0-9]+)$/i, `-${i}.$1`);
    const candidate = `${assetDir}/${candidateName}`;
    const exists = await callBackend('path_exists', { path: candidate }, 'File:Metadata', undefined, {
      ignore: true,
    });
    if (!exists) return candidate;
  }
  const lastResortName = `${formatTimestamp().replace('-', '')}-${Date.now()}.png`;
  return `${assetDir}/${lastResortName}`;
}

async function imageToPngBytes(image: Image): Promise<Uint8Array> {
  const rgba = await image.rgba();
  const { width, height } = await image.size();
  if (rgba.length !== width * height * 4) {
    throw new Error(`Invalid clipboard image data: expected ${width * height * 4} bytes, got ${rgba.length}`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const decoded = atob(base64);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

function dispatchPastedText(view: EditorView, text: string): void {
  const { state } = view;
  const pasted = state.toText(text);
  const byLine = pasted.lines === state.selection.ranges.length;
  let spec: TransactionSpec;
  if (byLine) {
    let i = 1;
    spec = state.changeByRange((range) => {
      const line = pasted.line(i++);
      return {
        changes: { from: range.from, to: range.to, insert: line.text },
        range: EditorSelection.cursor(range.from + line.length),
      };
    });
  } else {
    spec = state.replaceSelection(text);
  }
  view.dispatch(spec, {
    userEvent: 'input.paste',
    scrollIntoView: true,
  });
  view.focus();
}

function insertImageMarkdown(view: EditorView, relativeRef: string): void {
  const alt =
    relativeRef
      .split('/')
      .pop()
      ?.replace(/\.\w+$/, '') ?? 'image';
  const markdown = `![${alt}](${relativeRef})`;
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: markdown },
    selection: { anchor: sel.from + 2, head: sel.from + 2 + alt.length },
    userEvent: 'input.paste',
    scrollIntoView: true,
  });
  view.focus();
}
