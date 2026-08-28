import { Eraser, List, TextAlignStart, Type, WrapText } from 'lucide-svelte';
import type { TextOperation } from './types';

/**
 * Text Manipulation operation IDs
 */
export type TextManipulationOperationId =
  | 'trim-whitespace'
  | 'normalize-whitespace'
  | 'join-lines'
  | 'split-sentences'
  | 'wrap-quotes'
  | 'add-line-numbers'
  | 'indent-lines'
  | 'unindent-lines'
  | 'smart-paragraphs'
  | 'hard-wrap';

/**
 * Text Manipulation operations
 */
export const TEXT_MANIPULATION_OPERATIONS: Record<
  TextManipulationOperationId,
  TextOperation<TextManipulationOperationId>
> = {
  'trim-whitespace': {
    id: 'trim-whitespace',
    label: 'Trim Whitespace',
    description: 'Trim leading and trailing spaces',
    icon: Eraser,
    category: 'text',
    execution: 'client',
  },
  'normalize-whitespace': {
    id: 'normalize-whitespace',
    label: 'Normalize Whitespace',
    description: 'Replace multiple spaces with single',
    icon: Eraser,
    category: 'text',
    execution: 'client',
  },
  'join-lines': {
    id: 'join-lines',
    label: 'Join Lines',
    description: 'Combine all lines into one',
    icon: TextAlignStart,
    category: 'text',
    execution: 'client',
    defaultKey: 'ctrl+shift+j',
  },
  'split-sentences': {
    id: 'split-sentences',
    label: 'Sentences to new lines',
    description: 'Each sentence on new line',
    icon: TextAlignStart,
    category: 'text',
    execution: 'client',
  },
  'wrap-quotes': {
    id: 'wrap-quotes',
    label: 'Wrap in Quotes',
    description: 'Wrap each line in quotes',
    icon: Type,
    category: 'text',
    execution: 'client',
  },
  'add-line-numbers': {
    id: 'add-line-numbers',
    label: 'Number Each Line',
    description: 'Prefix with line numbers',
    icon: List,
    category: 'text',
    execution: 'client',
  },
  'indent-lines': {
    id: 'indent-lines',
    label: 'Indent Lines',
    description: 'Indent each line by default spacing',
    icon: TextAlignStart,
    category: 'text',
    execution: 'client',
  },
  'unindent-lines': {
    id: 'unindent-lines',
    label: 'Unindent Lines',
    description: 'Unindent each line by default spacing',
    icon: TextAlignStart,
    category: 'text',
    execution: 'client',
  },
  'smart-paragraphs': {
    id: 'smart-paragraphs',
    label: 'Smart Paragraphs',
    description: 'Split large blocks into paragraphs',
    icon: TextAlignStart,
    category: 'text',
    execution: 'client',
  },
  'hard-wrap': {
    id: 'hard-wrap',
    label: 'Wrap at Column',
    description: 'Rewrap paragraphs at the configured wrap column',
    icon: WrapText,
    category: 'text',
    execution: 'client',
  },
};
