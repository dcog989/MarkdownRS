import {
  camelCase as libCamelCase,
  capitalCase as libCapitalCase,
  constantCase as libConstantCase,
  dotCase as libDotCase,
  headerCase as libHeaderCase,
  kebabCase as libKebabCase,
  lowerCaseFirst as libLowerCaseFirst,
  noCase as libNoCase,
  pascalCase as libPascalCase,
  pathCase as libPathCase,
  sentenceCase as libSentenceCase,
  snakeCase as libSnakeCase,
  swapCase as libSwapCase,
  titleCase as libTitleCase,
  upperCaseFirst as libUpperCaseFirst,
} from 'text-case';
import { linesMap } from './helpers';

const SENTENCE_CASE_PREFIX_RE = /^(\s*)(-|\*|\+|[0-9]+\.|-\s*\[[ x]\])\s*(.*)$/;

export function swapCase(text: string): string {
  return linesMap(text, libSwapCase);
}

export function toTitleCase(text: string): string {
  return linesMap(text, libTitleCase);
}

export function toSentenceCase(text: string): string {
  return linesMap(text, (line) => {
    const match = line.match(SENTENCE_CASE_PREFIX_RE);
    if (match) {
      const [, indent, prefix, content] = match;
      if (!content) return line;
      return `${indent}${prefix} ${libSentenceCase(content)}`;
    }
    return libSentenceCase(line);
  });
}

export function toCamelCase(text: string): string {
  return linesMap(text, libCamelCase);
}

export function toPascalCase(text: string): string {
  return linesMap(text, libPascalCase);
}

export function toSnakeCase(text: string): string {
  return linesMap(text, libSnakeCase);
}

export function toKebabCase(text: string): string {
  return linesMap(text, libKebabCase);
}

export function toConstantCase(text: string): string {
  return linesMap(text, libConstantCase);
}

export function toDotCase(text: string): string {
  return linesMap(text, libDotCase);
}

export function toPathCase(text: string): string {
  return linesMap(text, libPathCase);
}

export function toHeaderCase(text: string): string {
  return linesMap(text, libHeaderCase);
}

export function toCapitalCase(text: string): string {
  return linesMap(text, libCapitalCase);
}

export function toNoCase(text: string): string {
  return linesMap(text, libNoCase);
}

export function toUpperCaseFirst(text: string): string {
  return linesMap(text, libUpperCaseFirst);
}

export function toLowerCaseFirst(text: string): string {
  return linesMap(text, libLowerCaseFirst);
}
