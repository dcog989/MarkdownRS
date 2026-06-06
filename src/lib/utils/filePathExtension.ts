import { type Extension, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const PATH_REGEX =
  /(['"`])((?!https?:\/\/|www\.)(?:[a-zA-Z]:[/\\]|(?:\.\.?|~)[/\\]|\/(?:[^/\s'"`\r\n]+[/\\])+[^'"`\r\n]*|[^'"`\r\n]+?\.[a-zA-Z0-9]{1,10}))\1|(?:https?:\/\/|www\.)[^\s"'`(){}[\]<>]+|(?:[a-zA-Z]:[/\\]|(?:\.{1,2}|~)[/\\]|(?:\/(?:[^/\s"'\r\n(){}[\]<>]+[/\\])+))(?:[^"'\r\n(){}[\]<>]+?\.[a-zA-Z0-9]{1,10}(?=[\s)\]}>.,;:?!]|$)|[^"'\r\n(){}[\]<>]+)/g;

// --- HELPERS ---

function stripTrailingPunctuation(str: string): string {
  return str.replace(/[.,;:?!]+$/, '');
}

export function extractPathAtPos(text: string, pos: number): string | null {
  PATH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  for (;;) {
    match = PATH_REGEX.exec(text);
    if (match === null) break;
    if (match[1]) {
      const content = match[2];
      const start = match.index + 1;
      const end = start + content.length;
      if (pos >= start && pos < end) return content;
    } else {
      const raw = match[0];
      const isUrl = raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('www.');
      if (isUrl) {
        const clean = stripTrailingPunctuation(raw);
        const start = match.index;
        const end = start + clean.length;
        if (pos >= start && pos < end) return clean;
      } else {
        if (match.index > 0 && /[\w-]/.test(text[match.index - 1])) continue;
        const clean = stripTrailingPunctuation(raw);
        const start = match.index;
        const end = start + clean.length;
        if (pos >= start && pos < end) return clean;
      }
    }
  }

  return null;
}

// --- VIEW PLUGIN ---

const filePathMark = Decoration.mark({ class: 'cm-file-path' });
const urlMark = Decoration.mark({ class: 'cm-url' });

function findLinks(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      const lineText = line.text;
      const found: { start: number; end: number; deco: Decoration }[] = [];
      let match: RegExpExecArray | null;

      PATH_REGEX.lastIndex = 0;
      for (;;) {
        match = PATH_REGEX.exec(lineText);
        if (match === null) break;
        if (match[1]) {
          const content = match[2];
          const start = line.from + match.index + 1;
          if (content.length > 0) {
            found.push({ start, end: start + content.length, deco: filePathMark });
          }
        } else {
          const raw = match[0];
          const isUrl = raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('www.');
          if (isUrl) {
            const clean = stripTrailingPunctuation(raw);
            const start = line.from + match.index;
            if (clean.length > 0) {
              found.push({ start, end: start + clean.length, deco: urlMark });
            }
          } else {
            if (match.index > 0 && /[\w-]/.test(lineText[match.index - 1])) continue;
            const clean = stripTrailingPunctuation(raw);
            const start = line.from + match.index;
            if (clean.length > 0) {
              found.push({ start, end: start + clean.length, deco: filePathMark });
            }
          }
        }
      }

      found.sort((a, b) => a.start - b.start);
      let lastEnd = -1;
      for (const f of found) {
        if (f.start >= lastEnd) {
          builder.add(f.start, f.end, f.deco);
          lastEnd = f.end;
        }
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

export const linkPlugin: Extension = ViewPlugin.fromClass(
  class {
    decorations;

    constructor(view: EditorView) {
      this.decorations = findLinks(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = findLinks(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export const linkTheme = EditorView.baseTheme({
  '.cm-file-path, .cm-url': {
    color: 'var(--accent-link)',
    textDecoration: 'underline',
    '&:hover': {
      color: 'var(--accent-link-hover)',
      textDecoration: 'underline',
    },
  },
  '&.cm-modifier-down .cm-file-path, &.cm-modifier-down .cm-url': {
    cursor: 'pointer',
  },
});
