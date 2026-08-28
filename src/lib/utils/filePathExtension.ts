import type { Extension, Range } from '@codemirror/state';
import { Decoration, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const PATH_REGEX =
  /(['"`])((?!https?:\/\/|www\.)(?:[a-zA-Z]:[/\\]|(?:\.\.?|~)[/\\]|\/(?:[^/\s'"`\r\n]+[/\\])+[^'"`\r\n]*|[^'"`\r\n]+?\.[a-zA-Z0-9]{1,10}))\1|(?:https?:\/\/|www\.)[^\s"'`(){}[\]<>]+|(?:[a-zA-Z]:[/\\]|(?:\.{1,2}|~)[/\\]|(?:\/(?:[^/\s"'\r\n(){}[\]<>]+[/\\])+))(?:[^"'\r\n(){}[\]<>]+?\.[a-zA-Z0-9]{1,10}(?=[\s)\]}>.,;:?!]|$)|[^\s"'(){}[\]<>]+)/g;

function stripTrailingPunctuation(str: string): string {
  return str.replace(/[.,;:?!]+$/, '');
}

const WIKILINK_REGEX = /\[\[([^[|]+?)(?:\|([^[|]+?))?]]/g;

export function extractWikilinkAtPos(text: string, pos: number): string | null {
  WIKILINK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  for (;;) {
    match = WIKILINK_REGEX.exec(text);
    if (match === null) break;
    const start = match.index;
    const end = start + match[0].length;
    if (pos >= start && pos < end) {
      const target = (match[1] || '').trim();
      return target || null;
    }
  }

  return null;
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

const filePathMark = Decoration.mark({ class: 'cm-file-path' });
const urlMark = Decoration.mark({ class: 'cm-url' });
const wikilinkMark = Decoration.mark({ class: 'cm-wikilink' });

function findWikilinks(view: EditorView) {
  const ranges: Range<Decoration>[] = [];
  const doc = view.state.doc;

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      const lineText = line.text;

      WIKILINK_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;

      while (true) {
        match = WIKILINK_REGEX.exec(lineText);
        if (match === null) break;

        const start = line.from + match.index + 2;
        const end = line.from + match.index + match[0].length - 2;
        if (end > start) {
          ranges.push(wikilinkMark.range(start, end));
        }
      }

      pos = line.to + 1;
    }
  }

  return ranges;
}

function findLinks(view: EditorView) {
  const ranges: Range<Decoration>[] = [];
  const doc = view.state.doc;

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      const lineText = line.text;

      PATH_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;

      while (true) {
        match = PATH_REGEX.exec(lineText);
        if (match === null) break;

        if (match[1]) {
          const content = match[2];
          const start = line.from + match.index + 1;
          if (content.length > 0) {
            ranges.push(filePathMark.range(start, start + content.length));
          }
        } else {
          const raw = match[0];
          const isUrl = raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('www.');
          if (isUrl) {
            const clean = stripTrailingPunctuation(raw);
            const start = line.from + match.index;
            if (clean.length > 0) {
              ranges.push(urlMark.range(start, start + clean.length));
            }
          } else {
            if (match.index > 0 && /[\w-]/.test(lineText[match.index - 1])) continue;
            const clean = stripTrailingPunctuation(raw);
            const start = line.from + match.index;
            if (clean.length > 0) {
              ranges.push(filePathMark.range(start, start + clean.length));
            }
          }
        }
      }

      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

export const linkPlugin: Extension = ViewPlugin.fromClass(
  class {
    decorations;

    constructor(view: EditorView) {
      this.decorations = findLinks(view).update({ add: findWikilinks(view) });
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = findLinks(update.view).update({ add: findWikilinks(update.view) });
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
