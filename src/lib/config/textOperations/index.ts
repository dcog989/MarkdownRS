import { CASE_OPERATIONS, type CaseOperationId } from './case';
import { FILTER_OPERATIONS, type FilterOperationId } from './filter';
import { MARKDOWN_OPERATIONS, type MarkdownOperationId } from './markdown';
import { SORT_OPERATIONS, type SortOperationId } from './sort';
import { TEXT_MANIPULATION_OPERATIONS, type TextManipulationOperationId } from './textManipulation';
import type { TextOperation } from './types';

export { OPERATION_CATEGORIES } from './categories';
export * from './types';

/**
 * Operation ID type - all valid operation identifiers
 */
export type OperationId =
  | SortOperationId
  | FilterOperationId
  | CaseOperationId
  | MarkdownOperationId
  | TextManipulationOperationId;

/**
 * Complete registry of all text operations
 */
export const TEXT_OPERATIONS_REGISTRY: Record<OperationId, TextOperation<OperationId>> = {
  ...SORT_OPERATIONS,
  ...FILTER_OPERATIONS,
  ...CASE_OPERATIONS,
  ...MARKDOWN_OPERATIONS,
  ...TEXT_MANIPULATION_OPERATIONS,
};

/**
 * Get operation metadata by ID
 */
export function getOperation(id: OperationId): TextOperation<OperationId> | undefined {
  return TEXT_OPERATIONS_REGISTRY[id];
}

/**
 * Get all operations for a category
 */
export function getOperationsByCategory(categoryId: string): TextOperation<OperationId>[] {
  return Object.values(TEXT_OPERATIONS_REGISTRY).filter((op) => op.category === categoryId);
}

/**
 * Validate that an operation ID exists
 */
export function isValidOperationId(id: string): id is OperationId {
  return id in TEXT_OPERATIONS_REGISTRY;
}
