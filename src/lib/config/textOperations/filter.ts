import { CircleMinus, Eraser, FunnelX } from 'lucide-svelte';
import type { TextOperation } from './types';

/**
 * Remove & Filter operation IDs
 */
export type FilterOperationId =
  | 'remove-duplicates'
  | 'remove-unique'
  | 'remove-blank'
  | 'remove-trailing-spaces'
  | 'remove-leading-spaces'
  | 'remove-all-spaces';

/**
 * Remove & Filter operations
 */
export const FILTER_OPERATIONS: Record<FilterOperationId, TextOperation<FilterOperationId>> = {
  'remove-duplicates': {
    id: 'remove-duplicates',
    label: 'Remove Duplicates',
    description: 'Keep only unique lines',
    icon: Eraser,
    category: 'filter',
    execution: 'client',
  },
  'remove-unique': {
    id: 'remove-unique',
    label: 'Remove Unique',
    description: 'Keep only duplicate lines',
    icon: FunnelX,
    category: 'filter',
    execution: 'client',
  },
  'remove-blank': {
    id: 'remove-blank',
    label: 'Remove Blank Lines',
    description: 'Remove all empty lines',
    icon: CircleMinus,
    category: 'filter',
    execution: 'client',
  },
  'remove-trailing-spaces': {
    id: 'remove-trailing-spaces',
    label: 'Remove Trailing Spaces',
    description: 'Trim whitespace from line ends',
    icon: Eraser,
    category: 'filter',
    execution: 'client',
  },
  'remove-leading-spaces': {
    id: 'remove-leading-spaces',
    label: 'Remove Leading Whitespace',
    description: 'Trim whitespace from line starts',
    icon: Eraser,
    category: 'filter',
    execution: 'client',
  },
  'remove-all-spaces': {
    id: 'remove-all-spaces',
    label: 'Remove All Whitespace',
    description: 'Remove all whitespace characters',
    icon: Eraser,
    category: 'filter',
    execution: 'client',
  },
};
