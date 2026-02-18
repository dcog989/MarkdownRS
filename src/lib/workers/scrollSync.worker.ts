/**
 * Scroll Sync Web Worker
 * Handles interpolation calculations off the main thread
 */

interface LineMapEntry {
    line: number;
    y: number;
}

interface SyncMessage {
    type: 'sync';
    direction: 'editor-to-preview' | 'preview-to-editor';
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    totalLines: number;
}

interface UpdateMapMessage {
    type: 'update-map';
    lineMap: LineMapEntry[];
}

let lineMap: LineMapEntry[] = [];

self.onmessage = (event: MessageEvent<SyncMessage | UpdateMapMessage>) => {
    const data = event.data;

    if (data.type === 'update-map') {
        lineMap = data.lineMap;
        return;
    }

    if (data.type === 'sync') {
        const result = calculateTargetScroll(
            data.direction,
            data.scrollTop,
            data.scrollHeight,
            data.clientHeight,
            data.totalLines,
        );

        self.postMessage({
            type: 'sync-result',
            targetScrollTop: result,
            direction: data.direction,
        });
    }
};

function calculateTargetScroll(
    direction: 'editor-to-preview' | 'preview-to-editor',
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    _totalLines: number,
): number {
    const maxScroll = scrollHeight - clientHeight;

    if (scrollTop <= 0) {
        return 0;
    }
    if (scrollTop >= maxScroll - 1) {
        if (direction === 'editor-to-preview') {
            return -1;
        } else {
            if (lineMap.length < 2) {
                return -1;
            }
            const lastEntry = lineMap[lineMap.length - 1];
            return lastEntry.line;
        }
    }

    if (lineMap.length < 2) {
        const pct = scrollTop / maxScroll;
        return pct * maxScroll;
    }

    if (direction === 'editor-to-preview') {
        const currentLine = scrollTop;
        return interpolate(currentLine, 'line', 'y');
    } else {
        const targetLine = interpolate(scrollTop, 'y', 'line');
        return targetLine;
    }
}

function interpolate(val: number, inputKey: 'line' | 'y', outputKey: 'line' | 'y'): number {
    const map = lineMap;
    let lo = 0;
    let hi = map.length - 1;

    // Binary search
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

export {};
