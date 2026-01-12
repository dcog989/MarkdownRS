import { CONFIG } from '$lib/utils/config';

export type LineChange = {
    lineNumber: number;
    timestamp: number;
};

export class LineChangeTracker {
    private changes: LineChange[] = [];
    private deletions: LineChange[] = [];
    private maxChanges = CONFIG.EDITOR.LINE_CHANGE_TRACK_LIMIT;

    recordChange(lineNumber: number): void {
        const timestamp = Date.now();

        this.changes = this.changes.filter((c) => c.lineNumber !== lineNumber);
        this.changes.push({ lineNumber, timestamp });
        this.prune();
    }

    /**
     * Record changes to multiple lines
     */
    recordChanges(lineNumbers: number[]): void {
        const timestamp = Date.now();
        const lineSet = new Set(lineNumbers);
        this.changes = this.changes.filter((c) => !lineSet.has(c.lineNumber));

        for (const lineNumber of lineNumbers) {
            this.changes.push({ lineNumber, timestamp });
        }

        this.prune();
    }

    /**
     * Record a deletion happening after/at a specific line
     */
    recordDeletion(lineNumber: number): void {
        const timestamp = Date.now();
        // Remove existing deletion at exactly this spot to update timestamp
        this.deletions = this.deletions.filter((d) => d.lineNumber !== lineNumber);
        this.deletions.push({ lineNumber, timestamp });
        this.prune();
    }

    private prune() {
        // Keep only the most recent changes/deletions
        if (this.changes.length > this.maxChanges) {
            this.changes = this.changes.slice(-this.maxChanges);
        }
        if (this.deletions.length > this.maxChanges) {
            this.deletions = this.deletions.slice(-this.maxChanges);
        }
    }

    /**
     * Get the alpha value (0-1) for a line based on recency
     */
    getLineAlpha(lineNumber: number, timespan: number, maxCount: number): number {
        const change = this.changes.find((c) => c.lineNumber === lineNumber);
        if (!change) return 0;
        return this.calculateAlpha(change, this.changes, timespan, maxCount);
    }

    /**
     * Get the alpha value (0-1) for a deletion marker at this line
     */
    getDeletionAlpha(lineNumber: number, timespan: number, maxCount: number): number {
        const deletion = this.deletions.find((d) => d.lineNumber === lineNumber);
        if (!deletion) return 0;
        return this.calculateAlpha(deletion, this.deletions, timespan, maxCount);
    }

    private calculateAlpha(item: LineChange, collection: LineChange[], timespan: number, maxCount: number): number {
        let timeAlpha = 1.0;
        let countAlpha = 1.0;

        if (timespan > 0) {
            const now = Date.now();
            const elapsed = (now - item.timestamp) / 1000;
            if (elapsed > timespan) return 0;
            timeAlpha = Math.max(0, 1 - elapsed / timespan);
        }

        if (maxCount > 0) {
            const sorted = [...collection].sort((a, b) => b.timestamp - a.timestamp);
            const index = sorted.findIndex((c) => c.lineNumber === item.lineNumber && c.timestamp === item.timestamp);

            if (index === -1 || index >= maxCount) return 0;

            const ratio = index / Math.max(1, maxCount - 1);
            const lowestAlpha = 0.15;
            countAlpha = Math.max(lowestAlpha, 1 - ratio * (1 - lowestAlpha));
        }

        return Math.min(timeAlpha, countAlpha);
    }

    /**
     * Clear all tracked changes
     */
    clear(): void {
        this.changes = [];
        this.deletions = [];
    }

    /**
     * Remove specific lines from tracking
     */
    removeLines(lineNumbers: number[]): void {
        const lineSet = new Set(lineNumbers);
        this.changes = this.changes.filter((c) => !lineSet.has(c.lineNumber));
    }

    /**
     * Update line numbers after insertions/deletions
     */
    adjustLineNumbers(fromLine: number, delta: number): void {
        // Adjust modification markers
        for (const change of this.changes) {
            if (change.lineNumber >= fromLine) {
                change.lineNumber += delta;
            }
        }

        // Adjust deletion markers
        for (const del of this.deletions) {
            if (del.lineNumber >= fromLine) {
                del.lineNumber += delta;
            }
        }

        // Remove invalid line numbers
        this.changes = this.changes.filter((c) => c.lineNumber >= 1);
        this.deletions = this.deletions.filter((d) => d.lineNumber >= 0); // 0 is valid for top-of-file deletions
    }
}
