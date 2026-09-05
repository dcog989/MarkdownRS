/**
 * Consolidated Text Operations Registry
 *
 * This module serves as the single source of truth for all text operations.
 * It maps operation IDs to their metadata (label, description, icon) and
 * execution context (client vs server).
 *
 * The registry is decomposed by category in ./textOperations and re-exported
 * here to preserve a stable public API.
 */
export * from "./textOperations";
