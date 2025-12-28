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
     * Both timespan and maxCount can be active simultaneously
     */
    getLineAlpha(
        lineNumber: number, 
        timespan: number, // seconds, 0 means unlimited
        maxCount: number  // 0 means disabled
    ): number {
        const change = this.changes.find(c => c.lineNumber === lineNumber);
        if (!change) return 0;

        let timeAlpha = 1.0;
        let countAlpha = 1.0;

        // Time-based filtering (if timespan > 0)
        if (timespan > 0) {
            const now = Date.now();
            const elapsed = (now - change.timestamp) / 1000; // convert to seconds
            
            if (elapsed > timespan) return 0;
            
            // Linear fade from 1.0 (just changed) to 0.0 (at timespan limit)
            timeAlpha = Math.max(0, 1 - (elapsed / timespan));
        }

        // Count-based filtering (if maxCount > 0)
        if (maxCount > 0) {
            // Sort by timestamp (newest first)
            const sortedChanges = [...this.changes].sort((a, b) => b.timestamp - a.timestamp);
            const index = sortedChanges.findIndex(c => c.lineNumber === lineNumber && c.timestamp === change.timestamp);
            
            if (index === -1 || index >= maxCount) return 0;
            
            // Linear fade from 1.0 (most recent) to lowest value (oldest in range)
            const ratio = index / Math.max(1, maxCount - 1);
            const lowestAlpha = 0.15; // Reduced minimum opacity
            countAlpha = Math.max(lowestAlpha, 1 - (ratio * (1 - lowestAlpha)));
        }

        // Return the minimum of both alphas (most restrictive)
        return Math.min(timeAlpha, countAlpha);
    }

    /**
     * Get all lines that should be highlighted
     */
    getHighlightedLines(
        timespan: number,
        maxCount: number
    ): Map<number, number> {
        if (maxCount === 0 && timespan === 0) return new Map();
        const result = new Map<number, number>();
        
        // Get all potentially visible changes
        let relevantChanges = [...this.changes];
        
        // Filter by time if timespan > 0
        if (timespan > 0) {
            const now = Date.now();
            const cutoff = now - (timespan * 1000);
            relevantChanges = relevantChanges.filter(c => c.timestamp >= cutoff);
        }
        
        // Sort by timestamp (newest first) and limit by count if maxCount > 0
        relevantChanges.sort((a, b) => b.timestamp - a.timestamp);
        if (maxCount > 0) {
            relevantChanges = relevantChanges.slice(0, maxCount);
        }
        
        // Calculate alpha for each change
        for (const change of relevantChanges) {
            const alpha = this.getLineAlpha(change.lineNumber, timespan, maxCount);
            if (alpha > 0) {
                result.set(change.lineNumber, alpha);
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
