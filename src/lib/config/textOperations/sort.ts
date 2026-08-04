import { ArrowDown01, ArrowDown10, ArrowDownAZ, ArrowDownZA, FunnelX } from 'lucide-svelte';
import type { TextOperation } from './types';

/**
 * Sort & Order operation IDs
 */
export type SortOperationId =
  | 'sort-asc'
  | 'sort-case-insensitive-asc'
  | 'sort-numeric-asc'
  | 'sort-length-asc'
  | 'sort-desc'
  | 'sort-case-insensitive-desc'
  | 'sort-numeric-desc'
  | 'sort-length-desc'
  | 'reverse'
  | 'shuffle';

/**
 * Sort & Order operations
 */
export const SORT_OPERATIONS: Record<SortOperationId, TextOperation<SortOperationId>> = {
  'sort-asc': {
    id: 'sort-asc',
    label: 'Ascending',
    description: 'Sort lines alphabetically A to Z',
    icon: ArrowDownAZ,
    category: 'sort',
    execution: 'client',
  },
  'sort-case-insensitive-asc': {
    id: 'sort-case-insensitive-asc',
    label: 'Ascending (Ignore Case)',
    description: 'Sort A to Z ignoring case',
    icon: ArrowDownAZ,
    category: 'sort',
    execution: 'client',
  },
  'sort-numeric-asc': {
    id: 'sort-numeric-asc',
    label: 'Ascending (Numeric)',
    description: 'Sort lines numerically (0-9)',
    icon: ArrowDown01,
    category: 'sort',
    execution: 'client',
  },
  'sort-length-asc': {
    id: 'sort-length-asc',
    label: 'Ascending (By Length)',
    description: 'Sort by line length ascending',
    icon: ArrowDownAZ,
    category: 'sort',
    execution: 'client',
  },
  'sort-desc': {
    id: 'sort-desc',
    label: 'Descending',
    description: 'Sort lines alphabetically Z to A',
    icon: ArrowDownZA,
    category: 'sort',
    execution: 'client',
  },
  'sort-case-insensitive-desc': {
    id: 'sort-case-insensitive-desc',
    label: 'Descending (Ignore Case)',
    description: 'Sort Z to A ignoring case',
    icon: ArrowDownZA,
    category: 'sort',
    execution: 'client',
  },
  'sort-numeric-desc': {
    id: 'sort-numeric-desc',
    label: 'Descending (Numeric)',
    description: 'Sort lines numerically (9-0)',
    icon: ArrowDown10,
    category: 'sort',
    execution: 'client',
  },
  'sort-length-desc': {
    id: 'sort-length-desc',
    label: 'Descending (By Length)',
    description: 'Sort by line length descending',
    icon: ArrowDownZA,
    category: 'sort',
    execution: 'client',
  },
  reverse: {
    id: 'reverse',
    label: 'Reverse',
    description: 'Reverse the order of all lines',
    icon: ArrowDownZA,
    category: 'sort',
    execution: 'client',
  },
  shuffle: {
    id: 'shuffle',
    label: 'Shuffle',
    description: 'Randomly shuffle line order',
    icon: FunnelX,
    category: 'sort',
    execution: 'client',
  },
};
