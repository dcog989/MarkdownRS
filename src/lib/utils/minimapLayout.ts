export const MINIMAP_WIDTH = 64;
export const LINE_HEIGHT = 2;
export const LINE_GAP = 1;
export const MIN_LINE_HEIGHT = 1;
export const CHARS_TO_PX = 0.75;
export const COMPRESS_SPACING = 1;

export interface MinimapLayout {
  totalLines: number;
  compressed: boolean;
  lineH: number;
  gap: number;
  totalBars: number;
  linesPerBar: number;
}

export function fitLines(
  availableHeight: number,
  lineCount: number,
  maxLineH: number,
  maxGap: number,
): { lineH: number; gap: number } {
  if (lineCount <= 1) return { lineH: availableHeight, gap: 0 };

  const ideal = lineCount * (maxLineH + maxGap);
  if (ideal <= availableHeight) return { lineH: maxLineH, gap: maxGap };

  const shrinkGap = Math.max(0, (availableHeight - lineCount * MIN_LINE_HEIGHT) / (lineCount - 1));
  const gap = Math.min(maxGap, shrinkGap);
  const lineH = (availableHeight - gap * (lineCount - 1)) / lineCount;
  return { lineH, gap };
}

export function lineToY(layout: MinimapLayout, line0: number): number {
  if (layout.compressed) {
    const bar = Math.min(Math.floor(line0 / layout.linesPerBar), layout.totalBars - 1);
    return bar * COMPRESS_SPACING;
  }
  return line0 * (layout.lineH + layout.gap);
}

export function yToLine(layout: MinimapLayout, y: number): number {
  if (layout.compressed) {
    const bar = Math.max(0, Math.min(Math.floor(y / COMPRESS_SPACING), layout.totalBars - 1));
    return Math.min(layout.totalLines - 1, Math.floor(bar * layout.linesPerBar));
  }
  const index = Math.floor(y / (layout.lineH + layout.gap));
  return Math.max(0, Math.min(layout.totalLines - 1, index));
}

export function minimapLineHeight(layout: MinimapLayout): number {
  return layout.compressed ? COMPRESS_SPACING : layout.lineH;
}
