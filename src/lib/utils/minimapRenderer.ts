import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

const MAX_BANDS = 200;

const TAG_TO_VAR: Record<string, string> = {
  Heading1: '--syntax-heading',
  Heading2: '--syntax-heading',
  Heading3: '--syntax-heading',
  Heading4: '--syntax-heading',
  Heading5: '--syntax-heading',
  Heading6: '--syntax-heading',
  HeaderMark: '--syntax-heading',
  Keyword: '--syntax-keyword',
  Type: '--syntax-keyword',
  Modifier: '--syntax-keyword',
  String: '--syntax-string',
  Comment: '--syntax-comment',
  LineComment: '--syntax-comment',
  BlockComment: '--syntax-comment',
  Number: '--syntax-atom',
  Boolean: '--syntax-atom',
  Atom: '--syntax-atom',
  Emphasis: '--syntax-emphasis',
  Strong: '--syntax-strong',
  Link: '--accent-link',
  URL: '--accent-url',
  FilePath: '--accent-filepath',
  FencedCode: '--code-fg',
  InlineCode: '--code-fg',
  CodeMark: '--code-fg',
  CodeInfo: '--code-fg',
  Quote: '--syntax-quote',
  Blockquote: '--syntax-quote',
  Strikethrough: '--syntax-strikethrough',
  List: '--syntax-list',
  ListItem: '--syntax-list',
  Image: '--syntax-atom',
  HorizontalRule: '--syntax-meta',
  Escape: '--syntax-meta',
  Entity: '--syntax-meta',
  Separator: '--syntax-meta',
};

interface BandColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

let colorCache: Record<string, string> = {};
let lastThemeCheck = 0;

function resolveCSSVar(varName: string): string {
  const now = Date.now();
  if (now - lastThemeCheck > 2000) {
    colorCache = {};
    lastThemeCheck = now;
  }
  if (!colorCache[varName]) {
    try {
      colorCache[varName] = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    } catch {
      colorCache[varName] = '';
    }
  }
  return colorCache[varName];
}

function parseColorToRgba(color: string): BandColor {
  if (!color) return { r: 80, g: 80, b: 80, a: 255 };
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
        a: 255,
      };
    }
    if (hex.length >= 6) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: 255,
      };
    }
  }
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: Number.parseInt(rgbMatch[1], 10),
      g: Number.parseInt(rgbMatch[2], 10),
      b: Number.parseInt(rgbMatch[3], 10),
      a: 255,
    };
  }
  const oklchMatch = color.match(/oklch\([^)]+\)/);
  if (oklchMatch) {
    return { r: 100, g: 100, b: 100, a: 200 };
  }
  return { r: 80, g: 80, b: 80, a: 255 };
}

export interface MinimapResult {
  bands: BandColor[];
  lineCount: number;
}

export function buildMinimapData(view: EditorView): MinimapResult {
  const doc = view.state.doc;
  const lineCount = doc.lines;
  const tree = syntaxTree(view.state);

  const bandCount = Math.min(lineCount, MAX_BANDS);
  const linesPerBand = Math.max(1, Math.ceil(lineCount / bandCount));
  const actualBands = Math.ceil(lineCount / linesPerBand);

  const bandTotals: Map<string, number>[] = Array.from({ length: actualBands }, () => new Map());

  const cursor = tree.cursor();
  do {
    const from = cursor.from;
    const to = cursor.to;
    const name = cursor.name;

    if (!name || name === 'Document' || name === 'Paragraph' || name === 'LineBreak' || name === 'Text') continue;
    if (to - from < 1) continue;

    const startLine = doc.lineAt(from).number;
    const endLine = Math.min(doc.lineAt(to).number, lineCount);

    const bandStart = Math.floor((startLine - 1) / linesPerBand);
    const bandEnd = Math.min(Math.floor((endLine - 1) / linesPerBand), actualBands - 1);

    const tagVar = TAG_TO_VAR[name];
    if (!tagVar) continue;

    for (let b = bandStart; b <= bandEnd; b++) {
      bandTotals[b].set(tagVar, (bandTotals[b].get(tagVar) || 0) + (to - from));
    }
  } while (cursor.next());

  const fallbackColor = resolveCSSVar('--text-secondary') || (doc.lines > 0 ? '#666' : '#333');
  const fb = parseColorToRgba(fallbackColor);

  const bands: BandColor[] = bandTotals.map((totals) => {
    if (totals.size === 0) return fb;
    let maxVar = '';
    let maxTotal = 0;
    for (const [varName, total] of totals) {
      if (total > maxTotal) {
        maxTotal = total;
        maxVar = varName;
      }
    }
    if (!maxVar) return fb;
    const resolved = resolveCSSVar(maxVar);
    return parseColorToRgba(resolved || fallbackColor);
  });

  return { bands, lineCount };
}

export function drawMinimap(
  canvas: HTMLCanvasElement,
  data: MinimapResult,
  viewportHeight: number,
  scrollHeight: number,
  scrollTop: number,
  width: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const bandCount = data.bands.length;

  canvas.style.width = `${width}px`;
  canvas.width = width * dpr;
  canvas.style.height = `${viewportHeight}px`;
  canvas.height = Math.ceil(viewportHeight * dpr);

  const bandHeight = viewportHeight / bandCount;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < bandCount; i++) {
    const band = data.bands[i];
    const y = i * bandHeight * dpr;
    const h = Math.max(1, bandHeight * dpr);
    ctx.fillStyle = `rgba(${band.r},${band.g},${band.b},${band.a / 255})`;
    ctx.fillRect(0, y, canvas.width, h);
  }

  const visibleRatio = viewportHeight / Math.max(1, scrollHeight);
  const vpThumbHeight = Math.max(20, viewportHeight * visibleRatio);
  const maxThumbTravel = viewportHeight - vpThumbHeight;
  const thumbTop = scrollHeight > viewportHeight ? (scrollTop / (scrollHeight - viewportHeight)) * maxThumbTravel : 0;

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, thumbTop * dpr, canvas.width, vpThumbHeight * dpr);
}
