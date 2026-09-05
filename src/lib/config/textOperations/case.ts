import { Type } from "lucide-svelte";
import type { TextOperation } from "./types";

/**
 * Case Transformations operation IDs
 */
export type CaseOperationId =
  | "uppercase"
  | "lowercase"
  | "title-case"
  | "sentence-case"
  | "camel-case"
  | "pascal-case"
  | "snake-case"
  | "kebab-case"
  | "constant-case"
  | "swap-case"
  | "dot-case"
  | "path-case"
  | "header-case"
  | "capital-case"
  | "no-case"
  | "upper-case-first"
  | "lower-case-first";

/**
 * Case Transformations operations
 */
export const CASE_OPERATIONS: Record<CaseOperationId, TextOperation<CaseOperationId>> = {
  uppercase: {
    id: "uppercase",
    label: "UPPER CASE",
    description: "Convert all text to upper case",
    icon: Type,
    category: "case",
    execution: "client",
    defaultKey: "ctrl+shift+u",
  },
  lowercase: {
    id: "lowercase",
    label: "lower case",
    description: "Convert all text to lower case",
    icon: Type,
    category: "case",
    execution: "client",
    defaultKey: "ctrl+shift+l",
  },
  "title-case": {
    id: "title-case",
    label: "Title Case",
    description: "Capitalize first letter of each word",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "sentence-case": {
    id: "sentence-case",
    label: "Sentence case",
    description: "Capitalize first letter of sentences",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "camel-case": {
    id: "camel-case",
    label: "camelCase",
    description: "Convert to camelCase format",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "pascal-case": {
    id: "pascal-case",
    label: "PascalCase",
    description: "Convert to PascalCase format",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "snake-case": {
    id: "snake-case",
    label: "snake_case",
    description: "Convert to snake_case format",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "kebab-case": {
    id: "kebab-case",
    label: "kebab-case",
    description: "Convert to kebab-case format",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "constant-case": {
    id: "constant-case",
    label: "CONSTANT_CASE",
    description: "Convert to CONSTANT_CASE format",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "swap-case": {
    id: "swap-case",
    label: "sWAP cASE",
    description: "Swap uppercase and lowercase letters",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "dot-case": {
    id: "dot-case",
    label: "dot.case",
    description: "Convert to dot.case format",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "path-case": {
    id: "path-case",
    label: "path/case",
    description: "Convert to path/case format",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "header-case": {
    id: "header-case",
    label: "Header-Case",
    description: "Convert to Header-Case format",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "capital-case": {
    id: "capital-case",
    label: "Capital Case",
    description: "Convert to Capital Case format",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "no-case": {
    id: "no-case",
    label: "no case",
    description: "Convert to space-separated lowercase",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "upper-case-first": {
    id: "upper-case-first",
    label: "Upper case first",
    description: "Capitalize the first letter",
    icon: Type,
    category: "case",
    execution: "client",
  },
  "lower-case-first": {
    id: "lower-case-first",
    label: "lower case first",
    description: "Lowercase the first letter",
    icon: Type,
    category: "case",
    execution: "client",
  },
};
