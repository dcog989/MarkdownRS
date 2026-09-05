import { Bold, Code, Hash, Italic, Link, List, Strikethrough, TextAlignStart, Type } from "lucide-svelte";
import type { TextOperation } from "./types";

/**
 * Markdown Formatting operation IDs
 */
export type MarkdownOperationId =
  | "toggle-bullets"
  | "add-numbers"
  | "add-checkboxes"
  | "generate-toc"
  | "format-document"
  | "toggle-blockquote"
  | "toggle-code-fence"
  | "increase-heading"
  | "decrease-heading"
  | "bold"
  | "italic"
  | "insert-link"
  | "strike"
  | "inline-code";

/**
 * Markdown Formatting operations
 */
export const MARKDOWN_OPERATIONS: Record<MarkdownOperationId, TextOperation<MarkdownOperationId>> = {
  "toggle-bullets": {
    id: "toggle-bullets",
    label: "Bullet Points",
    description: "Add or remove '- ' bullet prefix",
    icon: List,
    category: "markdown",
    execution: "client",
  },
  "add-numbers": {
    id: "add-numbers",
    label: "Add Numbering",
    description: "Prefix lines with '1. 2. 3.'",
    icon: List,
    category: "markdown",
    execution: "client",
  },
  "add-checkboxes": {
    id: "add-checkboxes",
    label: "Add Checkboxes",
    description: "Prefix lines with '- [ ]'",
    icon: List,
    category: "markdown",
    execution: "client",
  },
  "generate-toc": {
    id: "generate-toc",
    label: "Generate Table of Contents",
    description: "Insert/update table of contents from document headings",
    icon: List,
    category: "markdown",
    execution: "server",
    backendCommand: "generate_document_toc",
  },
  "format-document": {
    id: "format-document",
    label: "Format Document",
    description: "Format markdown document",
    icon: Type,
    category: "markdown",
    execution: "server",
    backendCommand: "format_markdown",
    defaultKey: "alt+shift+f",
  },
  "toggle-blockquote": {
    id: "toggle-blockquote",
    label: "Blockquote",
    description: "Add or remove '> ' blockquote prefix",
    icon: TextAlignStart,
    category: "markdown",
    execution: "client",
  },
  "toggle-code-fence": {
    id: "toggle-code-fence",
    label: "Code Block",
    description: "Add or remove ``` fences",
    icon: Hash,
    category: "markdown",
    execution: "client",
  },
  "increase-heading": {
    id: "increase-heading",
    label: "Increase Heading Level",
    description: "Add # to headings",
    icon: Hash,
    category: "markdown",
    execution: "client",
  },
  "decrease-heading": {
    id: "decrease-heading",
    label: "Decrease Heading Level",
    description: "Remove # from headings",
    icon: Hash,
    category: "markdown",
    execution: "client",
  },
  bold: {
    id: "bold",
    label: "Bold",
    description: "Wrap selection in **",
    icon: Bold,
    category: "markdown",
    execution: "client",
    defaultKey: "ctrl+b",
  },
  italic: {
    id: "italic",
    label: "Italic",
    description: "Wrap selection in *",
    icon: Italic,
    category: "markdown",
    execution: "client",
    defaultKey: "ctrl+i",
  },
  "insert-link": {
    id: "insert-link",
    label: "Insert Link",
    description: "Wrap selection in [text](url)",
    icon: Link,
    category: "markdown",
    execution: "client",
    defaultKey: "ctrl+k",
  },
  strike: {
    id: "strike",
    label: "Strikethrough",
    description: "Wrap selection in ~~",
    icon: Strikethrough,
    category: "markdown",
    execution: "client",
  },
  "inline-code": {
    id: "inline-code",
    label: "Inline Code",
    description: "Wrap selection in `",
    icon: Code,
    category: "markdown",
    execution: "client",
  },
};
