import { SvelteSet } from 'svelte/reactivity';
import { CONFIG } from '$lib/utils/config';

export type LineChange = {
  lineNumber: number;
  timestamp: number;
};

export class LineChangeTracker {
  private changes: LineChange[] = [];
  private deletions: LineChange[] = [];
  private maxChanges = CONFIG.EDITOR.LINE_CHANGE_TRACK_LIMIT;

  /**
   * Record changes to multiple lines
   */
  recordChanges(lineNumbers: number[]): void {
    const timestamp = Date.now();
    const lineSet = new SvelteSet(lineNumbers);
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
   * Whether any tracked change or deletion is still inside the time span.
   * Used to know when time-based highlighting no longer needs periodic
   * re-renders.
   */
  hasActiveHighlights(timespan: number): boolean {
    if (timespan <= 0) return false;
    const cutoff = Date.now() - timespan * 1000;
    return this.changes.some((c) => c.timestamp >= cutoff) || this.deletions.some((d) => d.timestamp >= cutoff);
  }

  /**
   * Clear all tracked changes
   */
  clear(): void {
    this.changes = [];
    this.deletions = [];
  }

  /**
   * Remove specific lines from tracking (both changes and deletions)
   */
  removeLines(lineNumbers: number[]): void {
    const lineSet = new SvelteSet(lineNumbers);
    this.changes = this.changes.filter((c) => !lineSet.has(c.lineNumber));
    this.deletions = this.deletions.filter((d) => !lineSet.has(d.lineNumber));
  }

  /**
   * Map tracked lines using a custom mapping function.
   * Useful for complex transformations where simple offset logic isn't enough.
   */
  mapLines(mapper: (line: number) => number | null): void {
    const newChanges: LineChange[] = [];
    const newDeletions: LineChange[] = [];
    const seenChanges = new SvelteSet<number>();
    const seenDeletions = new SvelteSet<number>();

    for (const change of this.changes) {
      const newLine = mapper(change.lineNumber);
      if (newLine !== null && newLine > 0) {
        if (!seenChanges.has(newLine)) {
          change.lineNumber = newLine;
          newChanges.push(change);
          seenChanges.add(newLine);
        }
      }
    }

    for (const del of this.deletions) {
      const newLine = mapper(del.lineNumber);
      if (newLine !== null && newLine >= 0) {
        if (!seenDeletions.has(newLine)) {
          del.lineNumber = newLine;
          newDeletions.push(del);
          seenDeletions.add(newLine);
        }
      }
    }

    this.changes = newChanges;
    this.deletions = newDeletions;
  }
}
