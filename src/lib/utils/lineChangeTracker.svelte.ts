/**
 * Line Change Tracker
 * Tracks which lines have been modified and when, for highlighting recent changes
 */

export type LineChange = {
    lineNumber: number;
    timestamp: number;
};

export class LineChangeTracker {
    private changes: LineChange[] = [];
    private maxChanges = 50; // Keep last 50 changes

    /**
     * Record a change to a line
     */
    recordChange(lineNumber: number): void {
        const timestamp = Date.now();
        
        // Remove any existing entry for this line
        this.changes = this.changes.filter(c => c.lineNumber !== lineNumber);
        
        // Add new change
        this.changes.push({ lineNumber, timestamp });
        
        // Keep only the most recent changes
        if (this.changes.length > this.maxChanges) {
            this.changes = this.changes.slice(-this.maxChanges);
        }
    }

    /**
     * Record changes to multiple lines
     */
    recordChanges(lineNumbers: number[]): void {
        const timestamp = Date.now();
        
        // Remove existing entries for these lines
        const lineSet = new Set(lineNumbers);
        this.changes = this.changes.filter(c => !lineSet.has(c.lineNumber));
        
        // Add new changes
        for (const lineNumber of lineNumbers) {
            this.changes.push({ lineNumber, timestamp });
        }
        
        // Keep only the most recent changes
        if (this.changes.length > this.maxChanges) {
            this.changes = this.changes.slice(-this.maxChanges);
        }
    }

    /**
     * Get the alpha value (0-1) for a line based on recency
     * More recent = higher alpha (more opaque)
     */
    getLineAlpha(
        lineNumber: number, 
        mode: 'disabled' | 'count' | 'time',
        timespan: number, // seconds
        maxCount: number
    ): number {
        if (mode === 'disabled') return 0;
        const change = this.changes.find(c => c.lineNumber === lineNumber);
        if (!change) return 0;

        if (mode === 'time') {
            // Time-based: calculate based on how recently changed
            const now = Date.now();
            const elapsed = (now - change.timestamp) / 1000; // convert to seconds
            
            if (elapsed > timespan) return 0;
            
            // Linear fade from 1.0 (just changed) to 0.0 (at timespan limit)
            return Math.max(0, 1 - (elapsed / timespan));
        } else {
            // Count-based: calculate based on position in recent changes
            // Sort by timestamp (newest first)
            const sortedChanges = [...this.changes].sort((a, b) => b.timestamp - a.timestamp);
            const index = sortedChanges.findIndex(c => c.lineNumber === lineNumber && c.timestamp === change.timestamp);
            
            if (index === -1 || index >= maxCount) return 0;
            
            // Linear fade from 1.0 (most recent) to 0.3 (oldest in range)
            const ratio = index / Math.max(1, maxCount - 1);
            return Math.max(0.3, 1 - (ratio * 0.7));
        }
    }

    /**
     * Get all lines that should be highlighted
     */
    getHighlightedLines(
        mode: 'disabled' | 'count' | 'time',
        timespan: number,
        maxCount: number
    ): Map<number, number> {
        if (mode === 'disabled') return new Map();
        const result = new Map<number, number>();
        
        if (mode === 'time') {
            const now = Date.now();
            const cutoff = now - (timespan * 1000);
            
            for (const change of this.changes) {
                if (change.timestamp >= cutoff) {
                    const alpha = this.getLineAlpha(change.lineNumber, mode, timespan, maxCount);
                    if (alpha > 0) {
                        result.set(change.lineNumber, alpha);
                    }
                }
            }
        } else {
            // Sort by timestamp and take the most recent N
            const sortedChanges = [...this.changes]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, maxCount);
            
            for (const change of sortedChanges) {
                const alpha = this.getLineAlpha(change.lineNumber, mode, timespan, maxCount);
                if (alpha > 0) {
                    result.set(change.lineNumber, alpha);
                }
            }
        }
        
        return result;
    }

    /**
     * Clear all tracked changes
     */
    clear(): void {
        this.changes = [];
    }

    /**
     * Remove specific lines from tracking (used for undo/redo)
     */
    removeLines(lineNumbers: number[]): void {
        const lineSet = new Set(lineNumbers);
        this.changes = this.changes.filter(c => !lineSet.has(c.lineNumber));
    }

    /**
     * Update line numbers after insertions/deletions
     */
    adjustLineNumbers(fromLine: number, delta: number): void {
        for (const change of this.changes) {
            if (change.lineNumber >= fromLine) {
                change.lineNumber += delta;
            }
        }
        
        // Remove any changes with invalid line numbers (< 1)
        this.changes = this.changes.filter(c => c.lineNumber >= 1);
    }
}
