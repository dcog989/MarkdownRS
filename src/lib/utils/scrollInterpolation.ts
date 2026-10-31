import { queryHTMLElements } from "./dom";

export interface LineMapEntry {
  line: number;
  y: number;
}

export function buildLineMap(container: HTMLElement, totalLines: number): LineMapEntry[] {
  const containerRect = container.getBoundingClientRect();
  const scrollTop = container.scrollTop;

  const elements = queryHTMLElements(container, "[data-sourcepos]");

  // DOM order is the only trustworthy order: footnotes render at the end of the
  // document but keep the source line of their definition, so sorting by line
  // would make y jump backwards and break the interpolation searches.
  const lineMap: LineMapEntry[] = [];
  for (const el of elements) {
    const sourcepos = el.getAttribute("data-sourcepos");
    if (!sourcepos) continue;
    const match = sourcepos.match(/^(\d+):\d+-\d+:\d+$/);
    if (!match) continue;
    const line = parseInt(match[1], 10);
    if (Number.isNaN(line)) continue;

    const rect = el.getBoundingClientRect();
    const y = rect.top - containerRect.top + scrollTop;
    const prev = lineMap[lineMap.length - 1];
    if (prev && (line <= prev.line || y < prev.y)) continue;
    lineMap.push({ line, y });
  }

  if (lineMap.length === 0 || lineMap[0].line > 1) {
    lineMap.unshift({ line: 1, y: 0 });
  } else {
    lineMap[0].y = 0;
  }

  const last = lineMap[lineMap.length - 1];
  if (last.line < totalLines) {
    const scrollHeight = container.scrollHeight;
    lineMap.push({ line: totalLines, y: scrollHeight });
  }

  return lineMap;
}

export function interpolate(val: number, inputKey: "line" | "y", outputKey: "line" | "y", map: LineMapEntry[]): number {
  let lo = 0;
  let hi = map.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid][inputKey] < val) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const idx = Math.max(0, Math.min(lo - 1, map.length - 2));
  const p1 = map[idx];
  const p2 = map[idx + 1];

  if (!p2) return p1 ? p1[outputKey] : 0;

  const inputSpan = p2[inputKey] - p1[inputKey];
  const outputSpan = p2[outputKey] - p1[outputKey];

  if (inputSpan === 0) return p1[outputKey];

  const ratio = (val - p1[inputKey]) / inputSpan;
  return p1[outputKey] + ratio * outputSpan;
}
