import type { ArrowDownAZ } from 'lucide-svelte';

/**
 * Lucide icon component type used across operation and category definitions.
 */
export type OperationIcon = typeof ArrowDownAZ;

/**
 * Operation definition with metadata and backend mapping
 */
export interface TextOperation<TId extends string = string> {
  id: TId;
  label: string;
  description: string;
  icon: OperationIcon;
  category: string;
  execution: 'client' | 'server';
  /**
   * Backend command name - only needed if execution is 'server'.
   */
  backendCommand?: string;
  /**
   * Default keyboard shortcut for this operation.
   */
  defaultKey?: string;
}

/**
 * Category definition
 */
export interface OperationCategory {
  id: string;
  title: string;
  icon: OperationIcon;
}
