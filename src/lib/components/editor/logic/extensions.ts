import { closeBrackets } from '@codemirror/autocomplete';
import { history, historyField } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, indentUnit, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search } from '@codemirror/search';
import type { Compartment, Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightWhitespace,
  type KeyBinding,
  tooltips,
} from '@codemirror/view';
import { createWrapExtension, getEditorKeymap } from '$lib/components/editor/codemirror/config';
import type { ContextMenuCallback } from '$lib/components/editor/codemirror/events';
import { prefetchHoverHandler, smartBacktickHandler } from '$lib/components/editor/codemirror/handlers';
import { translate } from '$lib/i18n';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { newlinePlugin, rulerPlugin, selectionWhitespacePlugin } from '$lib/utils/editorPlugins';
import { generateDynamicTheme } from '$lib/utils/editorTheme';
import { linkPlugin, linkTheme } from '$lib/utils/filePathExtension';
import { createFoldExtensions } from '$lib/utils/foldExtension';
import { frontmatterExtension } from '$lib/utils/frontmatterExtension';
import { createImagePasteExtension } from '$lib/utils/imagePaste';
import type { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { createCodeBlockCopyHandler, createMarkdownDecorationsPlugin } from '$lib/utils/markdownExtensions';
import { createMarkdownLinter } from '$lib/utils/markdownLintExtension.svelte';
import { createRecentChangesHighlighter } from '$lib/utils/recentChangesExtension';
import { userThemeExtension } from '$lib/utils/themeMapper';
import type { AppEditorView } from '../../../../global';

const defaultFallbackHighlighting = syntaxHighlighting(defaultHighlightStyle, {
  fallback: true,
});

export const markdownExtensions = [
  markdown({ base: markdownLanguage, extensions: frontmatterExtension, codeLanguages: languages }),
];

/** Base directory of the tab a view belongs to, for resolving relative image sources. */
export function getTabDirectory(view: EditorView): string {
  const tabId = (view as AppEditorView)._currentTabId ?? appContext.app.activeTabId;
  if (!tabId) return '';
  const path = appContext.editor.tabs.find((t) => t.id === tabId)?.path;
  return path ? path.replace(/[\\/][^\\/]+$/, '') : '';
}

export function resolveFileLanguage(path: string): LanguageDescription | null {
  return LanguageDescription.matchFilename(languages, path);
}

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
  rulerComp: Compartment;
  filePathComp: Compartment;
  markdownLintComp: Compartment;
  decorationComp: Compartment;
  foldComp: Compartment;
  keymapComp: Compartment;
  imagePasteComp: Compartment;
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
    c.foldComp.of(config.isMarkdown ? createFoldExtensions() : []),
    c.recentComp.of(createRecentChangesHighlighter(config.lineChangeTracker, config.onContextMenu)),
    closeBrackets(),
    smartBacktickHandler,
    prefetchHoverHandler,
    createCodeBlockCopyHandler({ translate, showToast }),

    // Links are clickable (Ctrl+Click) in every file type, so the highlight
    // affordance must match: apply decorations unless simple mode for large files.
    c.filePathComp.of(!config.isLargeFile ? [linkPlugin, linkTheme] : []),
    c.keymapComp.of(getEditorKeymap([...config.customKeymap])),
    c.themeComp.of(
      generateDynamicTheme(appContext.settings.editorFontSize, appContext.settings.editorFontFamily, isDark),
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
    c.imagePasteComp.of(config.isMarkdown ? [createImagePasteExtension()] : []),
    c.decorationComp.of(
      config.isMarkdown
        ? createMarkdownDecorationsPlugin(appContext.settings.viewMode === 'rendered', getTabDirectory)
        : [],
    ),
    c.rulerComp.of(rulerPlugin),
    c.wrapComp.of(createWrapExtension(config.isLargeFile)),
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
    EditorView.scrollMargins.of(() => ({ bottom: 30 })),
    // Constrain tooltip placement to the editor frame instead of the whole
    // window, so a lint hint near line 1 flips below the target instead of
    // rendering above it and getting cut off by the editor's overflow.
    tooltips({ tooltipSpace: (view) => view.dom.getBoundingClientRect() }),
    c.handlersComp.of(config.eventHandlers),
  ];

  if (config.currentHistoryState) {
    extensions.push(historyField.init(() => config.currentHistoryState));
  }

  return extensions;
}
