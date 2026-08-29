import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { completionStatus, pickedCompletion } from '@codemirror/autocomplete';
import { languages } from '@codemirror/language-data';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Matches the opening fence (optionally indented) with any language text typed
 * so far, anchored at the cursor.
 */
const FENCE_LANGUAGE_MATCH = /^(\s*)```([a-zA-Z0-9_+#.-]*)$/;

const COMMON_LANGUAGES = new Set([
  'bash',
  'css',
  'html',
  'javascript',
  'json',
  'markdown',
  'python',
  'rust',
  'sql',
  'toml',
  'typescript',
  'yaml',
]);

const LANGUAGE_OPTIONS: Completion[] = buildLanguageOptions();

function buildLanguageOptions(): Completion[] {
  const seen = new Set<string>();
  const options: Completion[] = [];

  for (const lang of languages) {
    const candidates = [lang.name, ...(lang.alias ?? [])];
    for (const candidate of candidates) {
      const label = candidate.toLowerCase();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      options.push({
        label,
        detail: lang.name,
        boost: COMMON_LANGUAGES.has(label) ? 1 : 0,
        apply: applyLanguage,
      });
    }
  }

  return options;
}

// An `apply` function must dispatch the transaction itself — CodeMirror
// ignores its return value.
function applyLanguage(view: EditorView, completion: Completion, from: number, to: number) {
  const plugin = view.plugin(fenceCursorPlugin);
  const anchor = plugin?.blockAnchor(view) ?? null;
  if (plugin) plugin.fenceLine = null;

  const delta = completion.label.length - (to - from);
  view.dispatch({
    changes: { from, to, insert: completion.label },
    ...(anchor != null ? { selection: { anchor: anchor + delta }, scrollIntoView: true } : {}),
    annotations: pickedCompletion.of(completion),
  });
}

function buildResult(before: { from: number; text: string }): CompletionResult | null {
  const match = FENCE_LANGUAGE_MATCH.exec(before.text);
  if (!match) return null;
  const from = before.from + match[1].length + 3;

  return {
    from,
    options: LANGUAGE_OPTIONS,
    // Refilter synchronously on each keystroke instead of waiting on the
    // global autocomplete typing delay.
    update: (_current, _selected, _new, context) => {
      const next = context.matchBefore(FENCE_LANGUAGE_MATCH);
      if (!next) return null;
      return buildResult(next);
    },
  };
}

export function fenceLanguageCompletion(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(FENCE_LANGUAGE_MATCH);
  if (!before) return null;
  return buildResult(before);
}

/**
 * Tracks the freshly opened code block. The cursor parks right after the fence
 * while the language picker is open; when the picker session closes without
 * accepting an option (Esc, blur, clicking away) while the cursor is still on
 * the fence line, the cursor is dropped into the block. Accepting a completion
 * clears the block in `applyLanguage`.
 */
export const fenceCursorPlugin = ViewPlugin.fromClass(
  class {
    fenceLine: number | null = null;
    private wasCompletionActive = false;

    arm(fenceLine: number) {
      this.fenceLine = fenceLine;
      this.wasCompletionActive = false;
    }

    /** Position to drop the cursor into the block (after the leading indent). */
    blockAnchor(view: EditorView): number | null {
      if (this.fenceLine == null) return null;
      return view.state.doc.line(this.fenceLine + 1).to;
    }

    update(update: ViewUpdate) {
      const isActive = completionStatus(update.state) != null;
      if (this.fenceLine != null && this.wasCompletionActive && !isActive) {
        const stillOnFenceLine = update.state.doc.lineAt(update.state.selection.main.head).number === this.fenceLine;
        const fenceLine = this.fenceLine;
        this.fenceLine = null;
        if (stillOnFenceLine) {
          const contentLine = update.state.doc.line(fenceLine + 1);
          update.view.dispatch({
            selection: { anchor: contentLine.to },
            scrollIntoView: true,
          });
        }
      }
      this.wasCompletionActive = isActive;
    }
  },
);

/**
 * Arms the block tracking for the fence that was just opened. Returns false
 * when the language picker is unavailable (autocomplete disabled), so callers
 * keep the pre-picker behavior of dropping straight into the block.
 */
export function armFenceLanguagePicker(view: EditorView, fenceLine: number): boolean {
  const plugin = view.plugin(fenceCursorPlugin);
  if (!plugin) return false;
  plugin.arm(fenceLine);
  return true;
}
