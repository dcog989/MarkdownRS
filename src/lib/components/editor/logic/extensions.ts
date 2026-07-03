import { closeBrackets } from '@codemirror/autocomplete';
import { history, historyField } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  defaultHighlightStyle,
  indentUnit,
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import { highlightSelectionMatches, search } from '@codemirror/search';
import { type Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightWhitespace,
  type KeyBinding,
} from '@codemirror/view';
import {
  createDoubleClickHandler,
  createWrapExtension,
  getEditorKeymap,
  smartCompleteAnyWord,
} from '$lib/components/editor/codemirror/config';
import type { ContextMenuCallback } from '$lib/components/editor/codemirror/events';
import { prefetchHoverHandler, smartBacktickHandler } from '$lib/components/editor/codemirror/handlers';
import { appContext } from '$lib/stores/state.svelte';
import { newlinePlugin, rulerPlugin, selectionWhitespacePlugin } from '$lib/utils/editorPlugins';
import { generateDynamicTheme } from '$lib/utils/editorTheme';
import { linkPlugin, linkTheme } from '$lib/utils/filePathExtension';
import type { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { markdownDecorationsPlugin } from '$lib/utils/markdownExtensions';
import { createMarkdownLinter } from '$lib/utils/markdownLintExtension.svelte';
import { createRecentChangesHighlighter } from '$lib/utils/recentChangesExtension';
import { userThemeExtension } from '$lib/utils/themeMapper';

function legacy(parser: import('@codemirror/language').StreamParser<unknown>) {
  return new LanguageSupport(StreamLanguage.define(parser));
}

const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['ecmascript', 'js', 'node', 'ts', 'typescript', 'jsx', 'tsx'],
    extensions: ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx'],
    load() {
      return import('@codemirror/lang-javascript').then((m) => m.javascript());
    },
  }),
  LanguageDescription.of({
    name: 'Python',
    extensions: ['py', 'pyw'],
    load() {
      return import('@codemirror/lang-python').then((m) => m.python());
    },
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['xhtml'],
    extensions: ['html', 'htm'],
    load() {
      return import('@codemirror/lang-html').then((m) => m.html());
    },
  }),
  LanguageDescription.of({
    name: 'CSS',
    extensions: ['css'],
    load() {
      return import('@codemirror/lang-css').then((m) => m.css());
    },
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json5'],
    extensions: ['json', 'map'],
    load() {
      return import('@codemirror/lang-json').then((m) => m.json());
    },
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yml'],
    extensions: ['yaml', 'yml'],
    load() {
      return import('@codemirror/lang-yaml').then((m) => m.yaml());
    },
  }),
  LanguageDescription.of({
    name: 'Rust',
    extensions: ['rs'],
    load() {
      return import('@codemirror/lang-rust').then((m) => m.rust());
    },
  }),
  LanguageDescription.of({
    name: 'C++',
    alias: ['cpp', 'cxx', 'cplusplus'],
    extensions: ['cpp', 'c++', 'cc', 'cxx', 'hpp', 'h++', 'hh', 'hxx', 'h', 'c'],
    load() {
      return import('@codemirror/lang-cpp').then((m) => m.cpp());
    },
  }),
  LanguageDescription.of({
    name: 'Bash',
    alias: ['sh', 'shell', 'zsh'],
    extensions: ['sh', 'bash', 'zsh'],
    load() {
      return import('@codemirror/legacy-modes/mode/shell').then((m) => legacy(m.shell));
    },
  }),
  LanguageDescription.of({
    name: 'SQL',
    extensions: ['sql'],
    load() {
      return import('@codemirror/lang-sql').then((m) => m.sql());
    },
  }),
];

const defaultFallbackHighlighting = syntaxHighlighting(defaultHighlightStyle, {
  fallback: true,
});

export const markdownExtensions = [markdown({ base: markdownLanguage, codeLanguages }), markdownDecorationsPlugin];

export interface Compartments {
  wrapComp: Compartment;
  autoComp: Compartment;
  recentComp: Compartment;
  historyComp: Compartment;
  themeComp: Compartment;
  indentComp: Compartment;
  spellComp: Compartment;
  whitespaceComp: Compartment;
  languageComp: Compartment;
  handlersComp: Compartment;
  doubleClickComp: Compartment;
  rulerComp: Compartment;
  filePathComp: Compartment;
  markdownLintComp: Compartment;
}

export interface ExtensionsConfig {
  currentHistoryState: unknown;
  lineChangeTracker: LineChangeTracker | undefined;
  autocompletionConfig: Extension | Extension[];
  isMarkdown: boolean;
  isLargeFile: boolean;
  customKeymap: readonly KeyBinding[];
  eventHandlers: Extension;
  compartments: Compartments;
  onContextMenu?: ContextMenuCallback;
}

export function createBaseExtensions(config: ExtensionsConfig): Extension[] {
  const isDark = appContext.settings.theme === 'dark';
  const c = config.compartments;
  const extensions: Extension[] = [
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    c.historyComp.of(history({ minDepth: appContext.settings.undoDepth })),
    search({ top: true }),
    highlightSelectionMatches(),
    c.autoComp.of(config.autocompletionConfig),
    c.recentComp.of(createRecentChangesHighlighter(config.lineChangeTracker, config.onContextMenu)),
    closeBrackets(),
    smartBacktickHandler,
    prefetchHoverHandler,
    EditorState.languageData.of(() => [{ autocomplete: smartCompleteAnyWord }]),
    c.filePathComp.of(config.isMarkdown ? [linkPlugin, linkTheme] : []),
    getEditorKeymap([...config.customKeymap]),
    c.themeComp.of(
      generateDynamicTheme(
        appContext.settings.editorFontSize,
        appContext.settings.editorFontFamily,
        isDark,
        appContext.metrics.insertMode,
      ),
    ),
    c.indentComp.of(indentUnit.of(' '.repeat(Math.max(1, appContext.settings.defaultIndent)))),
    c.whitespaceComp.of(
      appContext.settings.showWhitespace ? [highlightWhitespace(), newlinePlugin] : [selectionWhitespacePlugin],
    ),
    userThemeExtension,
    defaultFallbackHighlighting,
    c.languageComp.of(config.isMarkdown ? markdownExtensions : []),
    c.spellComp.of([]),
    c.markdownLintComp.of(config.isMarkdown ? createMarkdownLinter() : []),
    c.doubleClickComp.of(createDoubleClickHandler()),
    c.rulerComp.of(rulerPlugin),
    c.wrapComp.of(createWrapExtension(config.isLargeFile)),
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
    EditorView.scrollMargins.of(() => ({ bottom: 30 })),
    c.handlersComp.of(config.eventHandlers),
  ];

  if (config.currentHistoryState) {
    extensions.push(historyField.init(() => config.currentHistoryState));
  }

  return extensions;
}
